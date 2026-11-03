import {
  CATEGORY_LABEL,
  buildItinerary,
  compareScenarios,
  longestTravelDay,
  nightsByPlace,
  scenarioAlerts,
  simulateNights,
  uncertaintyDrivers,
  type Category,
  type Comparison,
  type Scenario,
  type TripTotals,
} from '../../engine';
import { CertaintyMeter } from '../../components/Certainty';
import { Stepper } from '../../components/Fields';
import { Money, MoneyRange } from '../../components/Money';
import { RouteLine } from '../../components/RouteLine';
import { hours, placeNamer, plural } from '../../lib/format';
import { useTrip } from '../../lib/store';

/** ["A","B","C"] → "A, B y C" */
const joinY = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

const KIND_LABEL = { abierto: 'Ruta abierta', ida_vuelta: 'Ida y vuelta por Madrid' } as const;
const CATS: Category[] = ['vuelos', 'trenes', 'bus_auto', 'hospedaje', 'comidas', 'local'];

export function Simulador() {
  const { data, mutate } = useTrip();
  const cmp = compareScenarios(data);
  const name = placeNamer(data);
  const sel = data.settings.selectedScenarioId;
  const byId = new Map(cmp.rows.map((r) => [r.id, r.totals]));
  // "Más económico" solo si le saca más de 1 % al segundo.
  const [r1, r2] = cmp.rows;
  const clearWinner = !!r1 && (!r2 || r2.totals.total.eur - r1.totals.total.eur > r1.totals.total.eur * 0.01);

  return (
    <>
      <section className="panel" aria-labelledby="sim-title">
        <div className="panel-head">
          <div>
            <h2 id="sim-title">¿Cómo hacemos París y Suiza?</h2>
            <p>Viaje completo para los tres: vuelos, trenes, hospedaje, comidas, días en casa y costos comunes.</p>
          </div>
        </div>
        <Verdict cmp={cmp} />
        <div className="tickets">
          {data.scenarios.map((s) => (
            <Ticket
              key={s.id}
              s={s}
              t={byId.get(s.id)!}
              selected={s.id === sel}
              cheapest={s.id === cmp.cheapestId && clearWinner}
              name={name}
              onPick={() =>
                mutate((d) => {
                  d.settings.selectedScenarioId = s.id;
                })
              }
            />
          ))}
        </div>
      </section>
      <Bars cmp={cmp} />
      <NightsPanel />
    </>
  );
}

function Verdict({ cmp }: { cmp: Comparison }) {
  const { data } = useTrip();
  const [first, second] = cmp.rows;
  if (!first) return null;
  const heavy = cmp.rows.map((r) => ({ id: r.id, ...longestTravelDay(buildItinerary(data, data.scenarios.find((s) => s.id === r.id)!)) }));
  const alertCounts = cmp.rows.map((r) => {
    const sc = data.scenarios.find((s) => s.id === r.id)!;
    return { id: r.id, n: scenarioAlerts(buildItinerary(data, sc)).length + sc.legs.filter((l) => l.risk).length };
  });
  // Diferencia menor al 1 %: empate práctico.
  const tie = second && Math.abs(second.totals.total.eur - first.totals.total.eur) <= first.totals.total.eur * 0.01;
  const tied = tie ? cmp.rows.filter((r) => Math.abs(r.totals.total.eur - first.totals.total.eur) <= first.totals.total.eur * 0.01).map((r) => r.id) : [];
  const sel = cmp.rows.find((r) => r.id === data.settings.selectedScenarioId) ?? first;
  const drivers = uncertaintyDrivers(data, data.scenarios.find((s) => s.id === sel.id)!, placeNamer(data));

  return (
    <div className="verdict" role="status">
      <div className="verdict-main">
        <span className="verdict-kicker">Lectura del motor</span>
        <p>
          {tie ? (
            <>
              <strong>{joinY(tied)} cuestan prácticamente lo mismo</strong> (diferencia menor al 1 %). La decisión entre ellos es de comodidad y
              calendario, no de dinero.{' '}
            </>
          ) : (
            <>
              <strong>Escenario {first.id}</strong> es el más económico
              {second && (
                <>
                  : <Money eur={second.totals.total.eur - first.totals.total.eur} /> menos que el {second.id}
                </>
              )}
              .{' '}
            </>
          )}
          {tie ? null : cmp.decisive ? (
            <>La diferencia se mantiene incluso en el peor caso.</>
          ) : (
            <>
              <strong>Aún no es concluyente</strong>: los rangos se cruzan, así que el orden puede cambiar con precios reales.
            </>
          )}
        </p>
        <dl className="verdict-facts">
          <div>
            <dt>Horas de traslado</dt>
            <dd>{cmp.rows.map((r) => `${r.id} ${hours(r.totals.hours)}`).join(' · ')}</dd>
          </div>
          <div>
            <dt>Día más pesado</dt>
            <dd>{heavy.map((h) => `${h.id} ${hours(h.hours)}`).join(' · ')}</dd>
          </div>
          <div>
            <dt>Noches de paseo</dt>
            <dd>{cmp.rows.map((r) => `${r.id} ${r.totals.nightsAway}`).join(' · ')}</dd>
          </div>
          <div>
            <dt>Alertas de calendario y ruta</dt>
            <dd>{alertCounts.map((a) => `${a.id} ${a.n}`).join(' · ')}</dd>
          </div>
        </dl>
      </div>
      {drivers.length > 0 && (
        <div className="verdict-next">
          <span className="verdict-kicker">Para decidir, cotiza primero ({sel.id})</span>
          <ol>
            {drivers.map((d) => (
              <li key={d.label}>
                {d.label} <span className="muted">· rango de <Money eur={d.spread} /></span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Ticket({
  s,
  t,
  selected,
  cheapest,
  name,
  onPick,
}: {
  s: Scenario;
  t: TripTotals;
  selected: boolean;
  cheapest: boolean;
  name: (id: string) => string;
  onPick: () => void;
}) {
  const { data, currency } = useTrip();
  const other = currency === 'COP' ? 'EUR' : 'COP';
  const nights = nightsByPlace(s);
  const itin = buildItinerary(data, s);
  const alerts = scenarioAlerts(itin);
  const heaviest = longestTravelDay(itin);
  const risks = s.legs.filter((l) => l.risk).length;
  const stays = Object.entries(nights).filter(([, n]) => n > 0);

  return (
    <article className={`tk${selected ? ' sel' : ''}`} aria-labelledby={`tk-${s.id}`}>
      <header className="tk-stub">
        <span className="tk-letter" aria-hidden="true">
          {s.id}
        </span>
        <div>
          <span className="tk-kind">{KIND_LABEL[s.kind]}</span>
          <h3 id={`tk-${s.id}`}>
            <span className="sr-only">Escenario {s.id}: </span>
            {s.name}
          </h3>
        </div>
        {cheapest && <span className="tk-flag">Más económico</span>}
      </header>
      <div className="tk-body">
        <RouteLine scenario={s} name={name} />
        <div className="tk-stats">
          {stays.map(([p, n]) => (
            <div key={p}>
              <small>{name(p)}</small>
              <strong>{plural(n, 'noche', 'noches')}</strong>
            </div>
          ))}
          <div>
            <small>Traslados</small>
            <strong>{hours(t.hours)}</strong>
          </div>
          <div>
            <small>Día más pesado</small>
            <strong>{hours(heaviest.hours)}</strong>
          </div>
          <div>
            <small>Vuelos</small>
            <strong>{s.legs.filter((l) => l.mode === 'vuelo').length}</strong>
          </div>
        </div>
        <dl className="tk-lines">
          {CATS.filter((c) => t.scenario.byCategory[c].eur > 0).map((c) => (
            <div key={c}>
              <dt>{CATEGORY_LABEL[c]}</dt>
              <dd>
                <Money eur={t.scenario.byCategory[c].eur} />
              </dd>
            </div>
          ))}
          <div className="sub">
            <dt>Comunes y días en casa</dt>
            <dd>
              <Money eur={t.common.eur + t.homeDays.eur} />
            </dd>
          </div>
        </dl>
        <div className="tk-total">
          <small>Viaje completo</small>
          <strong>
            <Money eur={t.total.eur} />
          </strong>
          <span>
            Rango <MoneyRange r={t.total} /> · <Money eur={t.total.eur} currency={other} />
          </span>
        </div>
        <div className="tk-meta">
          <div>
            <small>Por día de paseo</small>
            <strong>
              <Money eur={t.costPerDayAway.eur} />
            </strong>
          </div>
          <div>
            <small>Días libres en casa</small>
            <strong className="num">{t.freeDays}</strong>
          </div>
        </div>
        <CertaintyMeter c={t.certainty} />
        {(alerts.length > 0 || risks > 0) && (
          <p className="tk-alerts">
            ⚠ {plural(alerts.length + risks, 'alerta', 'alertas')} de calendario o ruta. Míralas en Itinerario.
          </p>
        )}
        <p className="tk-summary">{s.summary}</p>
        <button type="button" className="btn tk-pick" aria-pressed={selected} onClick={onPick}>
          {selected ? 'Analizando este escenario' : 'Analizar este escenario'}
        </button>
      </div>
    </article>
  );
}

function Bars({ cmp }: { cmp: Comparison }) {
  const { data } = useTrip();
  const budget = data.settings.budgetEUR;
  const top = Math.max(budget, ...cmp.rows.map((r) => r.totals.total.max)) * 1.04;
  const pct = (n: number) => `${(Math.max(0, n) / top) * 100}%`;
  const sel = data.settings.selectedScenarioId;

  return (
    <section className="panel" aria-labelledby="bars-title">
      <div className="panel-head">
        <div>
          <h2 id="bars-title">Comparación de costo total</h2>
          <p>La barra clara es el rango posible (mejor a peor caso); la marca es el valor más probable.</p>
        </div>
      </div>
      <div className="bars">
        {cmp.rows.map((r) => {
          const t = r.totals.total;
          return (
            <div key={r.id} className={`bar${r.id === sel ? ' on' : ''}`}>
              <span className="bar-lbl">Escenario {r.id}</span>
              <div className="bar-track" role="img" aria-label={`Escenario ${r.id}: entre ${Math.round(t.min)} y ${Math.round(t.max)} euros, probable ${Math.round(t.eur)}`}>
                <span className="bar-band" style={{ left: pct(t.min), width: `calc(${pct(t.max)} - ${pct(t.min)})` }} />
                <span className="bar-mark" style={{ left: pct(t.eur) }} />
                <span className="bar-budget" style={{ left: pct(budget) }} />
              </div>
              <span className="bar-val">
                <Money eur={t.eur} />
              </span>
            </div>
          );
        })}
      </div>
      <p className="legend">
        <span className="lg-band" /> Rango <span className="lg-mark" /> Más probable <span className="lg-budget" /> Presupuesto
        {data.settings.budgetDraft ? ' (provisional)' : ''}: <Money eur={budget} />
      </p>
    </section>
  );
}

function NightsPanel() {
  const { data, mutate } = useTrip();
  const s = data.scenarios.find((x) => x.id === data.settings.selectedScenarioId) ?? data.scenarios[0]!;
  const name = placeNamer(data);
  const places = [...new Set(s.stays.map((st) => st.placeId))];

  return (
    <section className="panel" aria-labelledby="nights-title">
      <div className="panel-head">
        <div>
          <h2 id="nights-title">¿Y si cambiamos las noches? · Escenario {s.id}</h2>
          <p>Cada cambio se aplica al escenario y recalcula todo: totales, días libres e itinerario.</p>
        </div>
      </div>
      <ul className="nights">
        {places.map((p) => {
          const n = nightsByPlace(s)[p] ?? 0;
          const plus = simulateNights(data, s, p, 1);
          return (
            <li key={p}>
              <div className="nights-name">
                <strong>{name(p)}</strong>
                <span className="muted">
                  +1 noche: <Money eur={plus.deltaTotal.eur} signed /> al viaje (<Money eur={plus.deltaScenario.eur} signed /> en ruta, menos un día en casa)
                </span>
              </div>
              <Stepper
                label={`Noches en ${name(p)}`}
                value={n}
                min={0}
                max={14}
                onChange={(v) =>
                  mutate((d) => {
                    const sc = d.scenarios.find((x) => x.id === s.id)!;
                    // Ajusta la última estadía de ese lugar (la primera si se quitan noches y la última queda en cero).
                    const idx = [...sc.stays.keys()].filter((i) => sc.stays[i]!.placeId === p);
                    const delta = v - n;
                    const target = delta > 0 ? idx[idx.length - 1]! : idx.reverse().find((i) => sc.stays[i]!.nights > 0)!;
                    sc.stays[target]!.nights = Math.max(0, sc.stays[target]!.nights + delta);
                  })
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
