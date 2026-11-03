import { add, constant, NO_CTX, projected, scale, sub, ZERO, type PriceCtx } from './range';
import { effectiveRate } from './money';
import { daysUsed, freeDays, hoursInTransit, nightsAway } from './days';
import type { Cost, Range, Scenario, TripData } from './types';

export type Category = 'vuelos' | 'trenes' | 'bus_auto' | 'hospedaje' | 'comidas' | 'local';

export const CATEGORY_LABEL: Record<Category, string> = {
  vuelos: 'Vuelos',
  trenes: 'Trenes',
  bus_auto: 'Bus y auto',
  hospedaje: 'Hospedaje',
  comidas: 'Comidas',
  local: 'Transporte local y entradas',
};

export interface Certainty {
  /** EUR (valor central) por estado. */
  estimado: number;
  cotizado: number;
  reservado: number;
  /** Fracción 0–1 del valor que ya está cotizado o reservado. */
  firmShare: number;
}

export interface ScenarioTotals {
  byCategory: Record<Category, Range>;
  total: Range;
  certainty: Certainty;
}

function emptyCategories(): Record<Category, Range> {
  return {
    vuelos: { ...ZERO },
    trenes: { ...ZERO },
    bus_auto: { ...ZERO },
    hospedaje: { ...ZERO },
    comidas: { ...ZERO },
    local: { ...ZERO },
  };
}

class CertaintyAcc {
  estimado = 0;
  cotizado = 0;
  reservado = 0;
  constructor(private readonly ctx: PriceCtx = NO_CTX) {}
  push(c: Cost, times = 1) {
    this[c.status] += projected(c, this.ctx).eur * times;
  }
  result(): Certainty {
    const total = this.estimado + this.cotizado + this.reservado;
    return {
      estimado: this.estimado,
      cotizado: this.cotizado,
      reservado: this.reservado,
      firmShare: total > 0 ? (this.cotizado + this.reservado) / total : 0,
    };
  }
}

/** Contexto de precios a partir de los ajustes del viaje. */
export function priceCtx(settings: TripData['settings']): PriceCtx {
  return { adjustPct: settings.priceAdjustPct, rate: effectiveRate(settings.baseRate, settings.cushionPct) };
}

/** Costo del escenario (solo lo que cambia entre escenarios). */
export function scenarioTotals(s: Scenario, ctx: PriceCtx = NO_CTX): ScenarioTotals {
  const cat = emptyCategories();
  const cert = new CertaintyAcc(ctx);
  const p = (c: Cost) => projected(c, ctx);

  for (const l of s.legs) {
    const key: Category = l.mode === 'vuelo' ? 'vuelos' : l.mode === 'tren' ? 'trenes' : 'bus_auto';
    cat[key] = add(cat[key], p(l.cost));
    cert.push(l.cost);
  }
  for (const st of s.stays) {
    // Se cuenta un día de comidas y gastos locales por noche de estadía.
    cat.hospedaje = add(cat.hospedaje, scale(p(st.lodgingPerNight), st.nights));
    cat.comidas = add(cat.comidas, scale(p(st.mealsPerDay), st.nights));
    cat.local = add(cat.local, scale(p(st.localPerDay), st.nights));
    cert.push(st.lodgingPerNight, st.nights);
    cert.push(st.mealsPerDay, st.nights);
    cert.push(st.localPerDay, st.nights);
  }

  return { byCategory: cat, total: add(...Object.values(cat)), certainty: cert.result() };
}

export interface TripTotals {
  scenario: ScenarioTotals;
  /** Costos comunes a todos los escenarios. */
  common: Range;
  /** Gasto de los días libres en casa. */
  homeDays: Range;
  /** Total del viaje completo. */
  total: Range;
  /** Presupuesto − total. Negativo = se pasa. */
  remaining: Range;
  daysUsed: number;
  freeDays: number;
  nightsAway: number;
  hours: number;
  /** Costo del escenario por día fuera de casa. */
  costPerDayAway: Range;
  certainty: Certainty;
}

export function tripTotals(data: TripData, s: Scenario): TripTotals {
  const { settings } = data;
  const ctx = priceCtx(settings);
  const sc = scenarioTotals(s, ctx);
  const cert = new CertaintyAcc(ctx);
  cert.estimado = sc.certainty.estimado;
  cert.cotizado = sc.certainty.cotizado;
  cert.reservado = sc.certainty.reservado;

  const common = add(...data.common.map((c) => projected(c.cost, ctx)));
  data.common.forEach((c) => cert.push(c.cost));

  const used = daysUsed(s, settings);
  const free = freeDays(s, settings);
  const homeDays = scale(projected(settings.homeDaily, ctx), Math.max(0, free));
  cert.push(settings.homeDaily, Math.max(0, free));

  const total = add(sc.total, common, homeDays);
  const away = Math.max(1, used);

  return {
    scenario: sc,
    common,
    homeDays,
    total,
    remaining: sub(constant(settings.budgetEUR), total),
    daysUsed: used,
    freeDays: free,
    nightsAway: nightsAway(s),
    hours: hoursInTransit(s),
    costPerDayAway: scale(sc.total, 1 / away),
    certainty: cert.result(),
  };
}

export function findScenario(data: TripData, id: string = data.settings.selectedScenarioId): Scenario {
  const s = data.scenarios.find((x) => x.id === id) ?? data.scenarios[0];
  if (!s) throw new Error('No hay escenarios definidos');
  return s;
}
