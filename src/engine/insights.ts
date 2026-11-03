import { projected, scale } from './range';
import { freeDays } from './days';
import { priceCtx } from './totals';
import type { Cost, Range, Scenario, TripData } from './types';

export interface UncertaintyDriver {
  /** Texto para mostrar, p. ej. "Hotel en París (3 noches)". */
  label: string;
  /** Ancho de la banda (máx − mín) en EUR: cuánto se cerraría el rango al cotizar. */
  spread: number;
  range: Range;
}

/**
 * Los costos aún estimados que más abren el rango del viaje.
 * Cotizarlos primero es lo que más acerca a una decisión.
 */
export function uncertaintyDrivers(data: TripData, s: Scenario, placeName: (id: string) => string, limit = 3): UncertaintyDriver[] {
  const ctx = priceCtx(data.settings);
  const out: UncertaintyDriver[] = [];
  const push = (label: string, c: Cost, times = 1) => {
    if (c.status !== 'estimado' || c.cop !== undefined || times <= 0) return;
    const r = scale(projected(c, ctx), times);
    if (r.max - r.min > 0) out.push({ label, spread: r.max - r.min, range: r });
  };

  for (const l of s.legs) {
    push(`${l.label ? `${l.label}: ` : ''}${placeName(l.from)} → ${placeName(l.to)}`, l.cost);
  }
  // Agrupa estadías repetidas del mismo lugar.
  const nights = new Map<string, { n: number; lodging: Cost; meals: Cost }>();
  for (const st of s.stays) {
    const e = nights.get(st.placeId);
    nights.set(st.placeId, { n: (e?.n ?? 0) + st.nights, lodging: st.lodgingPerNight, meals: st.mealsPerDay });
  }
  for (const [place, e] of nights) {
    push(`Hotel en ${placeName(place)} (${e.n} ${e.n === 1 ? 'noche' : 'noches'})`, e.lodging, e.n);
    push(`Comidas en ${placeName(place)}`, e.meals, e.n);
  }
  for (const c of data.common) push(c.label, c.cost);
  push('Gasto de los días en casa', data.settings.homeDaily, Math.max(0, freeDays(s, data.settings)));

  return out.sort((a, b) => b.spread - a.spread).slice(0, limit);
}
