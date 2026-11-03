import { useTrip } from '../lib/store';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function Header() {
  const { data } = useTrip();
  const s = data.settings;
  const t = s.travelers;
  const end = addDays(s.startDate, s.totalDays - 1);
  const kids = t.childrenLabel ?? `${t.children} ${t.children === 1 ? 'menor' : 'menores'}`;
  const who = `${t.adults} adultos${t.children ? ` + ${kids}` : ''}`;

  return (
    <header className="top">
      <div className="top-inner">
        <div>
          <span className="brand-kicker">
            <span className="dot" aria-hidden="true" /> Cuaderno de ruta · Octubre 2027
          </span>
          <h1>
            Eurotrip <em>en familia</em>
          </h1>
        </div>
        <div className="ticket" role="group" aria-label="Datos del viaje">
          <div>
            <small>Ruta</small>
            <strong>MDE → MAD</strong>
          </div>
          <div>
            <small>Fechas</small>
            <strong>
              {fmtDate(s.startDate)} – {fmtDate(end)}
            </strong>
          </div>
          <div>
            <small>Viajan</small>
            <strong>{who}</strong>
          </div>
        </div>
      </div>
    </header>
  );
}
