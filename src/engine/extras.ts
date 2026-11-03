import { add, projected, scale, sub } from './range';
import { priceCtx, tripTotals } from './totals';
import type { Extra, Range, Scenario, TripData } from './types';

/** si = cabe incluso en el peor caso; quizas = depende de precios aún estimados; no = no cabe ni en el mejor caso. */
export type Fit = 'si' | 'quizas' | 'no';

export interface ExtraEvaluation {
  extra: Extra;
  fitsTime: boolean;
  fitsBudget: Fit;
  /** Costo del extra menos lo que se ahorra al no estar esos días en casa. */
  netCost: Range;
  /** Presupuesto restante si se hace el extra. */
  remainingAfter: Range;
  /** Días libres que quedan si se hace el extra. */
  freeDaysAfter: number;
}

export function fitOf(remaining: Range): Fit {
  if (remaining.min >= 0) return 'si';
  if (remaining.max < 0) return 'no';
  return 'quizas';
}

function netCostOf(extras: Extra[], data: TripData): Range {
  const ctx = priceCtx(data.settings);
  const home = projected(data.settings.homeDaily, ctx);
  return add(...extras.map((e) => sub(projected(e.cost, ctx), scale(home, e.minDays))));
}

/** Evalúa un conjunto de extras hechos juntos. */
export function evaluateCombo(data: TripData, s: Scenario, extras: Extra[]) {
  const t = tripTotals(data, s);
  const days = extras.reduce((a, e) => a + e.minDays, 0);
  const net = netCostOf(extras, data);
  const remainingAfter = sub(t.remaining, net);
  return {
    fitsTime: days <= t.freeDays,
    fitsBudget: fitOf(remainingAfter),
    netCost: net,
    remainingAfter,
    freeDaysAfter: t.freeDays - days,
  };
}

export function evaluateExtra(data: TripData, s: Scenario, extra: Extra): ExtraEvaluation {
  return { extra, ...evaluateCombo(data, s, [extra]) };
}

export function evaluateExtras(data: TripData, s: Scenario): ExtraEvaluation[] {
  return data.extras.map((e) => evaluateExtra(data, s, e));
}
