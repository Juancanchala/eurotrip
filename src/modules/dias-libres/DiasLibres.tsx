import { useState } from 'react';
import { evaluateCombo, evaluateExtras, findScenario, tripTotals, type Fit } from '../../engine';
import { Money, MoneyRange } from '../../components/Money';
import { plural } from '../../lib/format';
import { useTrip } from '../../lib/store';

const FIT_TEXT: Record<Fit, string> = {
  si: 'Cabe en el presupuesto',
  quizas: 'Cabe solo si los precios salen bien',
  no: 'No cabe en el presupuesto',
};

export function DiasLibres() {
  const { data } = useTrip();
  const s = findScenario(data);
  const t = tripTotals(data, s);
  const evals = evaluateExtras(data, s);
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = data.extras.filter((e) => picked.includes(e.id));
  const combo = chosen.length ? evaluateCombo(data, s, chosen) : null;

  return (
    <>
      <section className="panel" aria-labelledby="dl-title">
        <div className="panel-head">
          <div>
            <h2 id="dl-title">Con el escenario {s.id}, esto queda libre</h2>
            <p>
              Viaje de {plural(data.settings.totalDays, 'día', 'días')}; {t.daysUsed} en ruta y {data.settings.fixedDays} de vuelo transatlántico.
            </p>
          </div>
          <div className="kpis">
            <div className={`kpi${t.freeDays < 0 ? ' warn' : ''}`}>
              <small>Días libres</small>
              <strong className="num">{t.freeDays}</strong>
            </div>
            <div className={`kpi${t.remaining.eur < 0 ? ' warn' : ''}`}>
              <small>Presupuesto restante</small>
              <strong>
                <Money eur={t.remaining.eur} />
              </strong>
            </div>
          </div>
        </div>

        <div className="extras">
          {evals.map((e) => {
            const on = picked.includes(e.extra.id);
            return (
              <article key={e.extra.id} className={`extra${on ? ' on' : ''}`}>
                <h3>{e.extra.name}</h3>
                <p className="muted small">{e.extra.summary}</p>
                <p className="small">
                  {plural(e.extra.minDays, 'día', 'días')} · costo adicional <Money eur={e.netCost.eur} />
                  <span className="muted"> (descontando esos días en casa)</span>
                </p>
                <div className="badges">
                  <span className={`badge ${e.fitsTime ? 'ok' : 'no'}`}>{e.fitsTime ? 'Cabe en el tiempo' : 'No alcanza el tiempo'}</span>
                  <span className={`badge fit-${e.fitsBudget}`}>{FIT_TEXT[e.fitsBudget]}</span>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.extra.id] : p.filter((x) => x !== e.extra.id)))}
                  />
                  Sumar a la combinación
                </label>
              </article>
            );
          })}
        </div>
      </section>

      {combo && (
        <section className="panel" aria-labelledby="combo-title" aria-live="polite">
          <h2 id="combo-title">Combinación: {chosen.map((c) => c.name).join(' + ')}</h2>
          <div className="kpis">
            <div className={`kpi${combo.fitsTime ? '' : ' warn'}`}>
              <small>Días libres después</small>
              <strong className="num">{combo.freeDaysAfter}</strong>
            </div>
            <div className={`kpi${combo.remainingAfter.eur < 0 ? ' warn' : ''}`}>
              <small>Presupuesto después</small>
              <strong>
                <Money eur={combo.remainingAfter.eur} />
              </strong>
              <span>
                <MoneyRange r={combo.remainingAfter} />
              </span>
            </div>
          </div>
          <p>
            {combo.fitsTime ? 'Cabe en el tiempo' : 'No cabe en el tiempo'} · {FIT_TEXT[combo.fitsBudget].toLowerCase()}. Costo adicional{' '}
            <Money eur={combo.netCost.eur} />.
          </p>
        </section>
      )}
    </>
  );
}
