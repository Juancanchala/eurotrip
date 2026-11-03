import { CATEGORY_LABEL, findScenario, projected, priceCtx, tripTotals, type Category, type Range } from '../../engine';
import { CertaintyMeter, StatusBadge } from '../../components/Certainty';
import { NumberField } from '../../components/Fields';
import { Money, MoneyRange } from '../../components/Money';
import { useTrip } from '../../lib/store';

const CATS: Category[] = ['vuelos', 'trenes', 'bus_auto', 'hospedaje', 'comidas', 'local'];

export function Presupuesto() {
  const { data, mutate, currency, rate } = useTrip();
  const s = findScenario(data);
  const t = tripTotals(data, s);
  const ctx = priceCtx(data.settings);

  const rows: { key: string; label: string; r: Range; tone: string }[] = [
    ...CATS.filter((c) => t.scenario.byCategory[c].eur > 0).map((c) => ({ key: c, label: CATEGORY_LABEL[c], r: t.scenario.byCategory[c], tone: c })),
    ...data.common.map((c) => ({ key: c.id, label: c.label, r: projected(c.cost, ctx), tone: 'comun' })),
    { key: 'casa', label: `Días en casa (${Math.max(0, t.freeDays)})`, r: t.homeDays, tone: 'casa' },
  ];
  const total = t.total.eur || 1;
  const inCop = currency === 'COP';

  return (
    <>
      <section className="panel" aria-labelledby="pre-title">
        <div className="panel-head">
          <div>
            <h2 id="pre-title">Presupuesto · Escenario {s.id}</h2>
            <p>{s.name}</p>
          </div>
        </div>

        <div className="stack" role="img" aria-label="Composición del costo total">
          {rows.map((r) => (
            <span key={r.key} className={`stack-seg tone-${r.tone}`} style={{ width: `${(r.r.eur / total) * 100}%` }} title={r.label} />
          ))}
        </div>

        <table className="table">
          <caption className="sr-only">Desglose del costo del viaje</caption>
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col" className="r">
                Probable
              </th>
              <th scope="col" className="r hide-sm">
                Rango
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">
                  <span className={`swatch tone-${r.tone}`} aria-hidden="true" />
                  {r.label}
                </th>
                <td className="r">
                  <Money eur={r.r.eur} />
                </td>
                <td className="r hide-sm muted">{r.r.min === r.r.max ? 'exacto' : <MoneyRange r={r.r} />}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total del viaje</th>
              <td className="r">
                <Money eur={t.total.eur} />
              </td>
              <td className="r hide-sm">
                <MoneyRange r={t.total} />
              </td>
            </tr>
            <tr className={t.remaining.eur < 0 ? 'over' : ''}>
              <th scope="row">{t.remaining.eur < 0 ? 'Te pasas del presupuesto' : 'Presupuesto restante'}</th>
              <td className="r">
                <Money eur={Math.abs(t.remaining.eur)} />
              </td>
              <td className="r hide-sm">
                <MoneyRange r={t.remaining} />
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="panel" aria-labelledby="obj-title">
        <div className="panel-head">
          <div>
            <h2 id="obj-title">Presupuesto objetivo</h2>
            <p>Cámbialo y todo se recalcula. Se guarda en euros; en pesos usa la tasa con colchón.</p>
          </div>
        </div>
        <div className="grid-fields">
          <NumberField
            label={`Presupuesto total (${inCop ? 'COP' : 'EUR'})`}
            value={Math.round(inCop ? data.settings.budgetEUR * rate : data.settings.budgetEUR)}
            min={0}
            suffix={inCop ? 'COP' : '€'}
            onChange={(n) =>
              mutate((d) => {
                d.settings.budgetEUR = Math.round(inCop ? (n ?? 0) / rate : (n ?? 0));
              })
            }
            hint={
              <>
                Equivale a <Money eur={data.settings.budgetEUR} currency={inCop ? 'EUR' : 'COP'} />
              </>
            }
          />
          <label className="check">
            <input
              type="checkbox"
              checked={data.settings.budgetDraft}
              onChange={(e) =>
                mutate((d) => {
                  d.settings.budgetDraft = e.target.checked;
                })
              }
            />
            Presupuesto provisional (aún lo estamos definiendo)
          </label>
        </div>
      </section>

      <section className="panel" aria-labelledby="cert-title">
        <div className="panel-head">
          <div>
            <h2 id="cert-title">¿Qué tan firmes son estas cifras?</h2>
            <p>Cada precio que coticen o reserven reduce la incertidumbre.</p>
          </div>
        </div>
        <CertaintyMeter c={t.certainty} label="Costo del viaje" />
        <ul className="cert-list">
          {(['reservado', 'cotizado', 'estimado'] as const).map((k) => (
            <li key={k}>
              <StatusBadge status={k} /> <Money eur={t.certainty[k]} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
