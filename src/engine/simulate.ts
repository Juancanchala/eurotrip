import { overlaps, sub } from './range';
import { tripTotals, type TripTotals } from './totals';
import type { Range, Scenario, TripData } from './types';

/** Devuelve una copia del escenario con `delta` noches más (o menos) en un lugar. */
export function withNights(s: Scenario, placeId: string, delta: number): Scenario {
  const idx = s.stays.findIndex((st) => st.placeId === placeId);
  if (idx < 0) throw new Error(`El escenario ${s.id} no tiene estadía en ${placeId}`);
  return {
    ...s,
    stays: s.stays.map((st, i) => (i === idx ? { ...st, nights: Math.max(0, st.nights + delta) } : st)),
  };
}

export interface NightsSimulation {
  before: TripTotals;
  after: TripTotals;
  /** Cambio en el total del viaje. */
  deltaTotal: Range;
  /** Cambio en el costo del escenario (sin el ahorro de días en casa). */
  deltaScenario: Range;
  deltaFreeDays: number;
}

export function simulateNights(data: TripData, s: Scenario, placeId: string, delta: number): NightsSimulation {
  const before = tripTotals(data, s);
  const after = tripTotals(data, withNights(s, placeId, delta));
  return {
    before,
    after,
    deltaTotal: sub(after.total, before.total),
    deltaScenario: sub(after.scenario.total, before.scenario.total),
    deltaFreeDays: after.freeDays - before.freeDays,
  };
}

export interface ScenarioRow {
  id: string;
  name: string;
  totals: TripTotals;
}

export interface Comparison {
  /** Ordenados de menor a mayor costo central. */
  rows: ScenarioRow[];
  cheapestId: string;
  /** true si el más barato lo es incluso comparando su peor caso con el mejor caso del siguiente. */
  decisive: boolean;
}

export function compareScenarios(data: TripData, ids?: string[]): Comparison {
  const list = ids ? data.scenarios.filter((s) => ids.includes(s.id)) : data.scenarios;
  const rows = list
    .map((s) => ({ id: s.id, name: s.name, totals: tripTotals(data, s) }))
    .sort((a, b) => a.totals.total.eur - b.totals.total.eur);
  const [first, second] = rows;
  if (!first) throw new Error('No hay escenarios para comparar');
  return {
    rows,
    cheapestId: first.id,
    decisive: !second || !overlaps(first.totals.total, second.totals.total),
  };
}
