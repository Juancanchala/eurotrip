import { useState } from 'react';
import { priceCtx, projected } from '../../engine';
import type { CostStatus } from '../../engine/types';
import { STATUS_LABEL } from '../../components/Certainty';
import { CostEditor } from '../../components/CostEditor';
import { NumberField } from '../../components/Fields';
import { Money, MoneyRange } from '../../components/Money';
import { todayIso } from '../../lib/format';
import { useTrip } from '../../lib/store';
import { SECTION_LABEL, applyToGroup, getCost, priceGroups, withCurrency, withStatus, withValue, type PriceGroup, type PriceSection } from './prices';

const STATUSES: CostStatus[] = ['estimado', 'cotizado', 'reservado'];

export function PriceList() {
  const { data } = useTrip();
  const groups = priceGroups(data);
  const sections = [...new Set(groups.map((g) => g.section))];
  const [filter, setFilter] = useState<PriceSection | 'todos'>('todos');
  const shown = sections.filter((s) => filter === 'todos' || s === filter);

  return (
    <section className="panel" aria-labelledby="prices-title">
      <div className="panel-head">
        <div>
          <h2 id="prices-title">Precios</h2>
          <p>
            Escribe el valor en <strong>pesos</strong> o en <strong>euros</strong> y elige si es estimado, cotizado o reservado. Si un vuelo u hotel aparece en
            varios escenarios, se actualiza en todos.
          </p>
        </div>
      </div>

      <div className="chips-filter" role="group" aria-label="Filtrar precios">
        {(['todos', ...sections] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === 'todos' ? 'Todos' : SECTION_LABEL[s].split(' (')[0]}
          </button>
        ))}
      </div>

      {shown.map((sec) => (
        <div key={sec} className="pr-section">
          <h3>{SECTION_LABEL[sec]}</h3>
          <ul className="pr-list">
            {groups
              .filter((g) => g.section === sec)
              .map((g) => (
                <PriceRow key={g.key} g={g} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PriceRow({ g }: { g: PriceGroup }) {
  const { data, mutate, rate } = useTrip();
  const [open, setOpen] = useState(false);
  const cost = getCost(data, g.refs[0]!);
  const inCop = cost.cop !== undefined;
  const value = projected(cost, priceCtx(data.settings));
  const apply = (fn: Parameters<typeof applyToGroup>[2]) => mutate((d) => applyToGroup(d, g, fn));

  return (
    <li className={`pr ${cost.status}`}>
      <div className="pr-head">
        <strong>{g.label}</strong>
        <span className="muted">
          {[g.detail, g.per, g.scenarios.length ? `escenario${g.scenarios.length > 1 ? 's' : ''} ${g.scenarios.join(', ')}` : null].filter(Boolean).join(' · ')}
        </span>
        {g.mixed && <span className="pr-mixed">Tiene valores distintos por escenario; al editar quedan iguales.</span>}
      </div>

      <div className="pr-edit">
        <NumberField
          hideLabel
          label={`Valor de ${g.label} en ${inCop ? 'pesos' : 'euros'}`}
          value={inCop ? cost.cop : cost.eur}
          min={0}
          suffix={inCop ? 'COP' : '€'}
          onChange={(n) => n !== undefined && apply((c) => withValue(c, n, inCop ? 'COP' : 'EUR', rate))}
        />
        <div className="toggle small" role="group" aria-label={`Moneda de ${g.label}`}>
          <button type="button" aria-pressed={inCop} onClick={() => apply((c) => withCurrency(c, 'COP', rate))}>
            COP
          </button>
          <button type="button" aria-pressed={!inCop} onClick={() => apply((c) => withCurrency(c, 'EUR', rate))}>
            EUR
          </button>
        </div>
        <label className="pr-status">
          <span className="sr-only">Estado de {g.label}</span>
          <select value={cost.status} onChange={(e) => apply((c) => withStatus(c, e.target.value as CostStatus, todayIso()))}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pr-foot">
        <span>
          ≈ <Money eur={value.eur} currency={inCop ? 'EUR' : 'COP'} />
          {value.min !== value.max && (
            <>
              {' '}
              · rango <MoneyRange r={value} />
            </>
          )}
          {cost.status === 'estimado' && data.settings.priceAdjustPct !== 0 && !inCop && <> · incluye +{data.settings.priceAdjustPct} % a 2027</>}
          {cost.checkedAt && cost.status !== 'estimado' && <> · {cost.status} el {cost.checkedAt}</>}
        </span>
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Ocultar detalles' : 'Rango, fuente y notas'}
        </button>
      </div>
      {open && <CostEditor title="Detalles" cost={cost} onChange={(c) => apply(() => c)} />}
    </li>
  );
}
