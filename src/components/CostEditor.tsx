import { useId } from 'react';
import { projected } from '../engine/range';
import { priceCtx } from '../engine/totals';
import type { Cost, CostStatus } from '../engine/types';
import { todayIso } from '../lib/format';
import { useTrip } from '../lib/store';
import { StatusBadge } from './Certainty';
import { NumberField, SelectField, TextField, isDateOrEmpty, isUrlOrEmpty } from './Fields';
import { Money } from './Money';

const STATUS_OPTIONS: { value: CostStatus; label: string }[] = [
  { value: 'estimado', label: 'Estimado (referencia)' },
  { value: 'cotizado', label: 'Cotizado (precio real visto)' },
  { value: 'reservado', label: 'Reservado (pagado)' },
];

/**
 * Editor de un costo dentro de un <details>: el resumen muestra valor y estado;
 * al abrir se editan rango, moneda, fuente y fecha.
 */
export function CostEditor({ title, cost, onChange, per }: { title: string; cost: Cost; onChange: (c: Cost) => void; per?: string }) {
  const { data, rate } = useTrip();
  const id = useId();
  const inCop = cost.cop !== undefined;
  const value = projected(cost, priceCtx(data.settings));
  const set = (patch: Partial<Cost>) => {
    const next: Cost = { ...cost, ...patch };
    for (const k of Object.keys(next) as (keyof Cost)[]) if (next[k] === undefined) delete next[k];
    onChange(next);
  };

  return (
    <details className="cost">
      <summary>
        <span className="cost-title">{title}</span>
        <span className="cost-sum">
          <Money eur={value.eur} />
          {per && <span className="cost-per"> {per}</span>}
          <StatusBadge status={cost.status} />
        </span>
      </summary>
      <div className="cost-body">
        <div className="toggle small" role="group" aria-label={`Moneda de ${title}`}>
          <button type="button" aria-pressed={!inCop} onClick={() => set({ cop: undefined, eur: Math.round((cost.cop ?? cost.eur * rate) / rate) })}>
            En euros
          </button>
          <button type="button" aria-pressed={inCop} onClick={() => set({ cop: Math.round(cost.eur * rate), min: undefined, max: undefined })}>
            Pagado en pesos
          </button>
        </div>
        <div className="grid-fields">
          {inCop ? (
            <NumberField label="Valor total (COP)" value={cost.cop} min={0} suffix="COP" onChange={(n) => set({ cop: n ?? 0, eur: Math.round((n ?? 0) / rate) })} hint="Monto fijo: no cambia con la tasa del euro." />
          ) : (
            <>
              <NumberField label="Valor" value={cost.eur} min={0} suffix="€" onChange={(n) => set({ eur: n ?? 0 })} />
              <NumberField label="Mínimo" value={cost.min} min={0} optional suffix="€" onChange={(n) => set({ min: n })} />
              <NumberField label="Máximo" value={cost.max} min={0} optional suffix="€" onChange={(n) => set({ max: n })} />
            </>
          )}
          <SelectField
            label="Estado"
            value={cost.status}
            options={STATUS_OPTIONS}
            onChange={(status) =>
              // Un precio cotizado o reservado es exacto: se quita el rango y se fecha.
              set(status === 'estimado' ? { status } : { status, min: undefined, max: undefined, checkedAt: cost.checkedAt ?? todayIso() })
            }
          />
          <TextField label="Fecha de consulta" type="date" value={cost.checkedAt ?? ''} validate={isDateOrEmpty} onChange={(v) => set({ checkedAt: v || undefined })} />
        </div>
        <TextField label="Fuente (enlace)" type="url" placeholder="https://" value={cost.source ?? ''} validate={isUrlOrEmpty} onChange={(v) => set({ source: v.trim() || undefined })} />
        <TextField label="Nota" value={cost.note ?? ''} multiline onChange={(v) => set({ note: v || undefined })} />
        {cost.source && (
          <a className="cost-link" href={cost.source} target="_blank" rel="noopener noreferrer" id={`${id}-src`}>
            Abrir fuente
          </a>
        )}
      </div>
    </details>
  );
}
