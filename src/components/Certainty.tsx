import type { Certainty } from '../engine/totals';
import type { CostStatus } from '../engine/types';

export const STATUS_LABEL: Record<CostStatus, string> = {
  estimado: 'Estimado',
  cotizado: 'Cotizado',
  reservado: 'Reservado',
};

export function StatusBadge({ status }: { status: CostStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Barra apilada: qué parte del costo está estimada, cotizada o reservada. */
export function CertaintyMeter({ c, label = 'Certeza de precios' }: { c: Certainty; label?: string }) {
  const total = c.estimado + c.cotizado + c.reservado || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  const firm = Math.round(c.firmShare * 100);
  return (
    <div className="cm">
      <div className="cm-head">
        <small>{label}</small>
        <strong className="num">{firm} % firme</strong>
      </div>
      <div className="cm-bar" role="img" aria-label={`${firm} % del costo cotizado o reservado`}>
        <span className="reservado" style={{ width: pct(c.reservado) }} />
        <span className="cotizado" style={{ width: pct(c.cotizado) }} />
        <span className="estimado" style={{ width: pct(c.estimado) }} />
      </div>
    </div>
  );
}
