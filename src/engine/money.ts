export type Currency = 'EUR' | 'COP';

export function effectiveRate(baseRate: number, cushionPct: number): number {
  return baseRate * (1 + cushionPct / 100);
}

/** Agrupa miles con punto (convención colombiana), sin depender del ICU del entorno. */
export function groupThousands(n: number): string {
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s.charAt(i);
  }
  return (neg ? '−' : '') + out;
}

export function formatEUR(eur: number): string {
  return `€ ${groupThousands(eur)}`;
}

/** COP en millones con una cifra decimal: "$ 38,4 M". Montos menores a 1 M en miles. */
export function formatCOPShort(cop: number): string {
  const neg = cop < 0 ? '−' : '';
  const abs = Math.abs(cop);
  if (abs >= 1_000_000) {
    const m = Math.round(abs / 100_000) / 10;
    return `${neg}$ ${String(m).replace('.', ',')} M`;
  }
  return `${neg}$ ${groupThousands(Math.round(abs / 1000))} mil`;
}

export function formatCOP(cop: number): string {
  return `$ ${groupThousands(cop)}`;
}

/** Formatea un valor en EUR en la moneda pedida. */
export function formatMoney(eur: number, currency: Currency, rate: number, opts: { short?: boolean } = {}): string {
  if (currency === 'EUR') return formatEUR(eur);
  const cop = eur * rate;
  return opts.short === false ? formatCOP(cop) : formatCOPShort(cop);
}
