import { findScenario, tripTotals } from '../engine';
import { useTrip } from '../lib/store';
import { Money, MoneyRange } from './Money';

/** Franja con lo esencial del escenario elegido. Todo sale del motor. */
export function Pulse() {
  const { data, currency, setCurrency } = useTrip();
  const s = findScenario(data);
  const t = tripTotals(data, s);
  const over = t.remaining.eur < 0;
  const firm = Math.round(t.certainty.firmShare * 100);

  return (
    <section className="pulse" aria-label={`Resumen del escenario ${s.id}`}>
      <div className="pulse-head">
        <p>
          Analizando <strong>escenario {s.id}</strong> · {s.name}
        </p>
        <div className="toggle" role="group" aria-label="Moneda">
          {(['COP', 'EUR'] as const).map((c) => (
            <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="pulse-grid">
        <div className="kpi">
          <small>Viaje completo</small>
          <strong>
            <Money eur={t.total.eur} />
          </strong>
          <span>
            <MoneyRange r={t.total} />
          </span>
        </div>
        <div className={`kpi${over ? ' warn' : ''}`}>
          <small>{over ? 'Te pasas por' : 'Presupuesto restante'}</small>
          <strong>
            <Money eur={Math.abs(t.remaining.eur)} />
          </strong>
          <span>
            de <Money eur={data.settings.budgetEUR} /> {data.settings.budgetDraft ? '(provisional)' : 'objetivo'}
          </span>
        </div>
        <div className={`kpi${t.freeDays < 0 ? ' warn' : ''}`}>
          <small>Días libres en casa</small>
          <strong className="num">{t.freeDays}</strong>
          <span>
            {t.daysUsed} en ruta · {data.settings.totalDays} en total
          </span>
        </div>
        <div className="kpi">
          <small>Certeza de precios</small>
          <strong className="num">{firm} %</strong>
          <span>{firm === 0 ? 'Todo es estimado aún' : 'cotizado o reservado'}</span>
        </div>
      </div>
    </section>
  );
}
