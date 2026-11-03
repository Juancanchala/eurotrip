/**
 * Números como se escriben en Colombia: punto para miles y coma para decimales.
 * Acepta también "$", "€", "COP", espacios y apóstrofos.
 *   "2.000.000" → 2000000   "1.300" → 1300   "1,5" → 1.5   "12.5" → 12.5   "2,000,000" → 2000000
 */
export function parseNumber(input: string): number | null {
  let t = input
    .trim()
    .replace(/cop|eur/gi, '')
    .replace(/[\s$€'’]/g, '')
    .replace(/^−/, '-');
  if (!t || t === '-') return null;
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    // 2.000.000 o 2.000.000,50 → miles con punto
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3}){2,}$/.test(t) || /^\d{1,3}(,\d{3})+\.\d+$/.test(t)) {
    // 2,000,000 o 1,234.5 → miles con coma (formato en inglés)
    t = t.replace(/,/g, '');
  } else if (/^\d+,\d+$/.test(t)) {
    // 1,5 → coma decimal
    t = t.replace(',', '.');
  } else if (!/^\d+(\.\d+)?$/.test(t)) {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** 2000000 → "2.000.000"; 1.5 → "1,5". */
export function formatNumber(n: number): string {
  const neg = n < 0;
  const [int, dec] = String(Math.abs(Math.round(n * 100) / 100)).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}
