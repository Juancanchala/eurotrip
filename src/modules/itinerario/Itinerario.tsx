import { buildItinerary, findScenario, freeDays, priceCtx, projected, type ItineraryDay } from '../../engine';
import { NumberField } from '../../components/Fields';
import { Money } from '../../components/Money';
import { fmtDay, fmtSpan, hours, MODE_LABEL, placeNamer, plural } from '../../lib/format';
import { useTrip } from '../../lib/store';

type Block = { type: 'casa'; days: ItineraryDay[] } | { type: 'dia'; day: ItineraryDay };

/** Agrupa días seguidos en casa sin alertas en un solo bloque. */
function blocks(days: ItineraryDay[]): Block[] {
  const out: Block[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (d.kind === 'casa' && d.alerts.length === 0) {
      if (last?.type === 'casa') last.days.push(d);
      else out.push({ type: 'casa', days: [d] });
    } else out.push({ type: 'dia', day: d });
  }
  return out;
}

export function Itinerario() {
  const { data, mutate } = useTrip();
  const s = findScenario(data);
  const it = buildItinerary(data, s);
  const name = placeNamer(data);
  const home = name(data.settings.hubPlaceIds[data.settings.hubPlaceIds.length - 1] ?? 'madrid');
  const free = freeDays(s, data.settings);
  const ctx = priceCtx(data.settings);

  return (
    <section className="panel" aria-labelledby="it-title">
      <div className="panel-head">
        <div>
          <h2 id="it-title">Itinerario · Escenario {s.id}</h2>
          <p>
            {fmtSpan(it.days[0]!.date, it.days[it.days.length - 1]!.date)} de 2027 ·{' '}
            {it.trips.map((t) => `salida ${t.trip}: ${fmtSpan(t.from, t.to)}`).join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid-fields">
        <NumberField
          label="Días de descanso al llegar"
          integer
          min={0}
          max={10}
          value={data.settings.itinerary.restDaysOnArrival}
          onChange={(n) =>
            mutate((d) => {
              d.settings.itinerary.restDaysOnArrival = n ?? 0;
            })
          }
          hint="Antes de la primera salida desde Madrid."
        />
        {s.kind === 'ida_vuelta' && (
          <NumberField
            label="Días en casa entre salidas"
            integer
            min={0}
            max={10}
            value={data.settings.itinerary.gapDaysBetweenTrips}
            onChange={(n) =>
              mutate((d) => {
                d.settings.itinerary.gapDaysBetweenTrips = n ?? 0;
              })
            }
          />
        )}
      </div>

      {it.overflowDays > 0 && (
        <div className="notice error">
          El plan no cabe: faltan {plural(it.overflowDays, 'día', 'días')}. Reduce noches o días de descanso, o alarga el viaje en Datos y precios.
        </div>
      )}
      {free > 0 && it.overflowDays === 0 && (
        <p className="muted small">Quedan {plural(free, 'día libre', 'días libres')} en casa para descansar o para extras.</p>
      )}

      <ol className="days">
        {blocks(it.days).map((b) =>
          b.type === 'casa' ? (
            <li key={b.days[0]!.date} className="day casa">
              <div className="day-date">{b.days.length === 1 ? fmtDay(b.days[0]!.date) : fmtSpan(b.days[0]!.date, b.days[b.days.length - 1]!.date)}</div>
              <div className="day-body">
                <strong>
                  {plural(b.days.length, 'día', 'días')} en {home}
                </strong>
                <span className="muted"> · libres</span>
              </div>
            </li>
          ) : (
            <li key={b.day.date} className={`day ${b.day.kind}`}>
              <div className="day-date">{fmtDay(b.day.date)}</div>
              <div className="day-body">
                {b.day.kind === 'transatlantico' && (
                  <strong>{b.day.index === 0 ? 'Vuelo Medellín → Madrid' : 'Vuelo Madrid → Medellín'}</strong>
                )}
                {b.day.kind === 'casa' && <strong>En {home}</strong>}
                {b.day.legs.map((l) => (
                  <div key={l.id} className="day-leg">
                    <span className={`mode ${l.mode}`}>{MODE_LABEL[l.mode]}</span>
                    <strong>
                      {name(l.from)} → {name(l.to)}
                    </strong>
                    {l.label && <span className="muted"> · {l.label}</span>}
                    <span className="muted day-h">
                      {hours(l.hours)} · <Money eur={projected(l.cost, ctx).eur} />
                    </span>
                    {l.risk && <p className="day-risk">⚠ {l.risk}</p>}
                  </div>
                ))}
                {b.day.kind === 'ruta' && b.day.sleepAt && (
                  <span className="day-sleep">Noche en {name(b.day.sleepAt)}</span>
                )}
                {b.day.alerts.map((a) => (
                  <p key={a.id} className={`day-alert ${a.level}`}>
                    {a.level === 'aviso' ? '⚠ ' : 'ℹ '}
                    {a.message}
                  </p>
                ))}
              </div>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
