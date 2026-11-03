import type { CalendarAlert, Leg, Scenario, TripData } from './types';

export type DayKind = 'transatlantico' | 'casa' | 'ruta';

export interface ItineraryDay {
  index: number;
  /** AAAA-MM-DD */
  date: string;
  kind: DayKind;
  /** Dónde se duerme esa noche (null = en vuelo o último día). */
  sleepAt: string | null;
  legs: Leg[];
  /** Número de salida desde casa (1, 2…) en días de ruta. */
  trip?: number;
  alerts: CalendarAlert[];
}

export interface Itinerary {
  days: ItineraryDay[];
  /** Días que el plan necesita y no caben en el viaje. 0 = cabe. */
  overflowDays: number;
  /** Fechas de inicio y fin de cada salida. */
  trips: { trip: number; from: string; to: string }[];
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Divide los tramos en salidas: cada salida termina al volver a casa. */
export function splitTrips(s: Scenario, hubs: string[]): Leg[][] {
  const trips: Leg[][] = [];
  let cur: Leg[] = [];
  for (const l of s.legs) {
    cur.push(l);
    if (hubs.includes(l.to)) {
      trips.push(cur);
      cur = [];
    }
  }
  if (cur.length) trips.push(cur);
  return trips;
}

function alertsFor(alerts: CalendarAlert[], date: string, places: string[], legs: Leg[]): CalendarAlert[] {
  return alerts.filter((a) => {
    if (date < a.from || date > a.to) return false;
    if (a.labelIncludes) {
      const needle = a.labelIncludes.toLowerCase();
      return legs.some((l) => (l.label ?? '').toLowerCase().includes(needle) && (a.placeIds.length === 0 || a.placeIds.includes(l.from) || a.placeIds.includes(l.to)));
    }
    return a.placeIds.length === 0 || places.some((p) => a.placeIds.includes(p));
  });
}

/**
 * Asigna una fecha a cada tramo y cada noche.
 * Día 0: vuelo transatlántico de ida. Último día: regreso.
 * Después de llegar se descansa `restDaysOnArrival` días en casa; entre salidas, `gapDaysBetweenTrips`.
 * Una estadía de n noches empieza el día de llegada; el siguiente tramo sale n días después.
 * Si un lugar aparece varias veces, sus estadías se consumen en orden.
 */
export function buildItinerary(data: TripData, s: Scenario): Itinerary {
  const { settings } = data;
  const N = settings.totalDays;
  const hubs = settings.hubPlaceIds;
  const home = hubs[hubs.length - 1] ?? hubs[0] ?? null; // Guadarrama si está
  const fixedStart = Math.max(1, settings.fixedDays - 1);
  const lastIdx = N - 1;

  const map = new Map<number, ItineraryDay>();
  const day = (i: number): ItineraryDay => {
    let d = map.get(i);
    if (!d) {
      d = { index: i, date: addDays(settings.startDate, i), kind: 'casa', sleepAt: home, legs: [], alerts: [] };
      map.set(i, d);
    }
    return d;
  };

  // Estadías por lugar, en orden.
  const queue = new Map<string, number[]>();
  for (const st of s.stays) queue.set(st.placeId, [...(queue.get(st.placeId) ?? []), st.nights]);

  const trips: Itinerary['trips'] = [];
  let cursor = fixedStart + settings.itinerary.restDaysOnArrival;
  let lastUsed = fixedStart - 1;

  splitTrips(s, hubs).forEach((legs, t) => {
    const trip = t + 1;
    let i = cursor;
    const start = i;
    for (const l of legs) {
      const d = day(i);
      d.kind = 'ruta';
      d.trip = trip;
      d.legs.push(l);
      d.sleepAt = hubs.includes(l.to) ? home : l.to;
      const nights = queue.get(l.to)?.shift() ?? 0;
      for (let k = 1; k < nights; k++) {
        const n = day(i + k);
        n.kind = 'ruta';
        n.trip = trip;
        n.sleepAt = l.to;
      }
      i += nights;
    }
    // El día en que se vuelve a casa también se usa.
    trips.push({ trip, from: addDays(settings.startDate, start), to: addDays(settings.startDate, i) });
    lastUsed = i;
    cursor = i + 1 + settings.itinerary.gapDaysBetweenTrips;
  });

  // Vuelos transatlánticos (fijos).
  for (let i = 0; i < fixedStart; i++) {
    const d = day(i);
    d.kind = 'transatlantico';
    d.sleepAt = i === fixedStart - 1 ? null : d.sleepAt;
  }
  const last = day(lastIdx);
  const overflowDays = Math.max(0, lastUsed - (lastIdx - 1));
  last.kind = 'transatlantico';
  last.sleepAt = null;

  const days: ItineraryDay[] = [];
  for (let i = 0; i < N; i++) {
    const d = day(i);
    const places = [d.sleepAt, ...d.legs.flatMap((l) => [l.from, l.to])].filter((p): p is string => !!p);
    d.alerts = alertsFor(data.alerts, d.date, places, d.legs);
    days.push(d);
  }
  return { days, overflowDays, trips };
}

/** Todas las alertas que tocan el escenario, sin repetir, con las fechas en que aplican. */
export function scenarioAlerts(it: Itinerary): { alert: CalendarAlert; dates: string[] }[] {
  const byId = new Map<string, { alert: CalendarAlert; dates: string[] }>();
  for (const d of it.days) {
    for (const a of d.alerts) {
      const e = byId.get(a.id) ?? { alert: a, dates: [] };
      e.dates.push(d.date);
      byId.set(a.id, e);
    }
  }
  return [...byId.values()];
}
