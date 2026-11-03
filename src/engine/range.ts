import type { Cost, Range } from './types';

export const ZERO: Range = Object.freeze({ eur: 0, min: 0, max: 0 });

/** Convierte un costo en rango, garantizando min ≤ eur ≤ max. */
export function rangeOf(c: Cost): Range {
  const min = c.min ?? c.eur;
  const max = c.max ?? c.eur;
  return {
    eur: c.eur,
    min: Math.min(min, c.eur, max),
    max: Math.max(max, c.eur, min),
  };
}

/** Contexto para convertir un costo en EUR del viaje. */
export interface PriceCtx {
  /** % de ajuste de los costos estimados a la fecha del viaje. */
  adjustPct: number;
  /** Tasa EUR→COP efectiva, para costos fijados en COP. */
  rate: number;
}

export const NO_CTX: PriceCtx = Object.freeze({ adjustPct: 0, rate: 1 });

/**
 * Rango en EUR a la fecha del viaje:
 * - costos fijados en COP: se convierten con la tasa, sin rango ni ajuste;
 * - costos estimados (precios de hoy): se ajustan por `adjustPct`;
 * - cotizados o reservados: tal cual.
 */
export function projected(c: Cost, ctx: PriceCtx = NO_CTX): Range {
  if (c.cop !== undefined && ctx.rate > 0) return constant(c.cop / ctx.rate);
  const r = rangeOf(c);
  return c.status === 'estimado' && ctx.adjustPct !== 0 ? scale(r, 1 + ctx.adjustPct / 100) : r;
}

export function add(...rs: Range[]): Range {
  return rs.reduce(
    (acc, r) => ({ eur: acc.eur + r.eur, min: acc.min + r.min, max: acc.max + r.max }),
    { ...ZERO },
  );
}

export function scale(r: Range, k: number): Range {
  // Con k negativo se invierten los extremos.
  const a = r.min * k;
  const b = r.max * k;
  return { eur: r.eur * k, min: Math.min(a, b), max: Math.max(a, b) };
}

/** a − b, propagando el peor y el mejor caso. */
export function sub(a: Range, b: Range): Range {
  return { eur: a.eur - b.eur, min: a.min - b.max, max: a.max - b.min };
}

export function constant(n: number): Range {
  return { eur: n, min: n, max: n };
}

/** ¿Se cruzan las bandas de dos rangos? */
export function overlaps(a: Range, b: Range): boolean {
  return a.min <= b.max && b.min <= a.max;
}
