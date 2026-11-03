import { formatMoney, type Currency } from '../engine/money';
import type { Range } from '../engine/types';
import { useTrip } from '../lib/store';

/** Muestra un monto en EUR en la moneda activa. Toda cifra visible pasa por aquí. */
export function Money({ eur, currency, signed }: { eur: number; currency?: Currency; signed?: boolean }) {
  const { currency: active, rate } = useTrip();
  const cur = currency ?? active;
  const sign = signed && eur > 0 ? '+' : '';
  return <span className="num">{sign + formatMoney(eur, cur, rate)}</span>;
}

/** Rango "mín – máx" en la moneda activa. */
export function MoneyRange({ r }: { r: Range }) {
  return (
    <span className="num">
      <Money eur={r.min} /> – <Money eur={r.max} />
    </span>
  );
}
