import type { Cost, Stay, TripData } from '../engine/types';

/**
 * Versión de las rutas de referencia. Cuando sube, los datos guardados reciben las
 * rutas nuevas conservando todo lo que la familia editó.
 *  1: escenarios iniciales (incluían ida y vuelta con 4 vuelos).
 *  2: rutas reales con 2 vuelos: París→Bernina→Milán, la inversa y la variante en tren.
 */
export const CURRENT_SEED_REVISION = 2;

const isFirm = (c: Cost) => c.status !== 'estimado' || c.cop !== undefined;
const legKey = (from: string, to: string, mode: string) => `${from}|${to}|${mode}`;

export interface Migration {
  data: TripData;
  changed: boolean;
}

export function migrateTrip(data: TripData, seed: TripData): Migration {
  if (data.seedRevision >= CURRENT_SEED_REVISION) return { data, changed: false };
  const next = structuredClone(data);

  // Lugares y alertas nuevos (sin tocar los existentes).
  for (const p of seed.places) if (!next.places.some((x) => x.id === p.id)) next.places.push(structuredClone(p));
  const fixedAlerts = new Set(['frejus']); // alertas de referencia corregidas en esta revisión
  for (const a of seed.alerts) {
    const i = next.alerts.findIndex((x) => x.id === a.id);
    if (i < 0) next.alerts.push(structuredClone(a));
    else if (fixedAlerts.has(a.id)) next.alerts[i] = structuredClone(a);
  }

  // Precios que la familia ya fijó (cotizados, reservados o en pesos) se reutilizan en las rutas nuevas.
  const firmLegs = new Map<string, Cost>();
  const firmStays = new Map<string, Partial<Pick<Stay, 'lodgingPerNight' | 'mealsPerDay' | 'localPerDay'>>>();
  for (const s of data.scenarios) {
    for (const l of s.legs) if (isFirm(l.cost)) firmLegs.set(legKey(l.from, l.to, l.mode), l.cost);
    for (const st of s.stays) {
      const e = firmStays.get(st.placeId) ?? {};
      for (const f of ['lodgingPerNight', 'mealsPerDay', 'localPerDay'] as const) if (isFirm(st[f])) e[f] = st[f];
      firmStays.set(st.placeId, e);
    }
  }

  next.scenarios = seed.scenarios.map((sc) => {
    const s = structuredClone(sc);
    for (const l of s.legs) {
      const firm = firmLegs.get(legKey(l.from, l.to, l.mode));
      if (firm) l.cost = structuredClone(firm);
    }
    for (const st of s.stays) Object.assign(st, structuredClone(firmStays.get(st.placeId) ?? {}));
    return s;
  });
  next.settings.selectedScenarioId = seed.settings.selectedScenarioId;

  // Supuestos nuevos de las rutas, sin borrar los que la familia escribió.
  for (const a of seed.assumptions) if (!next.assumptions.includes(a) && a.startsWith('Rutas abiertas')) next.assumptions.splice(1, 0, a);

  next.seedRevision = CURRENT_SEED_REVISION;
  return { data: next, changed: true };
}
