import { useRef, useState, type ReactNode } from 'react';
import { validateTrip, type Cost, type Leg, type Mode, type Scenario, type Stay, type TripData } from '../../engine';
import { CostEditor } from '../../components/CostEditor';
import { NumberField, SelectField, TextField, isDateOrEmpty, isUrlOrEmpty } from '../../components/Fields';
import { exportTrip, importTrip } from '../../data/repository';
import { getAuthor, setAuthor, type VersionInfo } from '../../data/cloud';
import { fmtWhen } from '../../components/SyncBadge';
import { MODE_LABEL, hours, placeNamer } from '../../lib/format';
import { useTrip } from '../../lib/store';

const MODES: Mode[] = ['tren', 'vuelo', 'bus', 'auto'];
const newCost = (): Cost => ({ eur: 0, status: 'estimado' });
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function slug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'lugar';
  let s = base;
  for (let i = 2; taken.has(s); i++) s = `${base}-${i}`;
  return s;
}

function Section({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="panel ed-section" open={open}>
      <summary>
        <h2>{title}</h2>
      </summary>
      <div className="ed-body">{children}</div>
    </details>
  );
}

export function Datos() {
  const { data } = useTrip();
  const issues = validateTrip(data);
  return (
    <>
      <section className="panel" aria-labelledby="dat-title">
        <div className="panel-head">
          <div>
            <h2 id="dat-title">Datos y precios</h2>
            <p>
              Todo lo que calcula la app sale de aquí. Al tener un precio real, márquenlo como <strong>cotizado</strong> o <strong>reservado</strong>: el
              rango se cierra y la certeza sube.
            </p>
          </div>
        </div>
        {issues.length > 0 ? (
          <ul className="issues">
            {issues.map((i, k) => (
              <li key={k} className={i.level}>
                <strong>{i.where}:</strong> {i.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ok-line">✓ Datos coherentes: todos los recorridos salen y vuelven a casa.</p>
        )}
      </section>
      <ScenariosEditor />
      <TripEditor />
      <CommonEditor />
      <ExtrasEditor />
      <PlacesEditor />
      <AlertsEditor />
      <Backup />
    </>
  );
}

/* ---------------- Viaje ---------------- */

function TripEditor() {
  const { data, mutate } = useTrip();
  const st = data.settings;
  const set = (fn: (s: TripData['settings']) => void) => mutate((d) => fn(d.settings));
  return (
    <Section title="Viaje y viajeros">
      <div className="grid-fields">
        <TextField label="Salida desde Medellín" type="date" value={st.startDate} validate={(v) => (v ? isDateOrEmpty(v) : 'Requerido')} onChange={(v) => set((s) => void (s.startDate = v))} />
        <NumberField label="Días totales del viaje" integer min={5} max={60} value={st.totalDays} onChange={(n) => n && set((s) => void (s.totalDays = n))} hint="De puerta a puerta, incluidos los vuelos largos." />
        <NumberField label="Días de vuelo transatlántico" integer min={0} max={6} value={st.fixedDays} onChange={(n) => set((s) => void (s.fixedDays = n ?? 0))} />
        <NumberField label="Adultos" integer min={1} max={10} value={st.travelers.adults} onChange={(n) => n && set((s) => void (s.travelers.adults = n))} />
        <NumberField label="Menores" integer min={0} max={10} value={st.travelers.children} onChange={(n) => set((s) => void (s.travelers.children = n ?? 0))} />
        <TextField
          label="Edades de los menores"
          value={st.travelers.childAges.join(', ')}
          validate={(v) => (v.trim() === '' || /^\s*\d{1,2}(\s*,\s*\d{1,2})*\s*$/.test(v) ? null : 'Ej.: 11 o 11, 7')}
          onChange={(v) => set((s) => void (s.travelers.childAges = v.split(',').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x))))}
        />
        <TextField label="Cómo nombrarlos" placeholder="1 niña" value={st.travelers.childrenLabel ?? ''} onChange={(v) => set((s) => void (s.travelers.childrenLabel = v || undefined))} />
      </div>
      <CostEditor title="Gasto diario en casa (Guadarrama/Madrid)" per="/ día" cost={st.homeDaily} onChange={(c) => set((s) => void (s.homeDaily = c))} />
    </Section>
  );
}

/* ---------------- Escenarios ---------------- */

function ScenariosEditor() {
  const { data, mutate } = useTrip();
  const [cur, setCur] = useState(data.settings.selectedScenarioId);
  const s = data.scenarios.find((x) => x.id === cur) ?? data.scenarios[0]!;
  const name = placeNamer(data);
  const placeOpts = data.places.map((p) => ({ value: p.id, label: `${p.name} (${p.country})` }));
  const edit = (fn: (sc: Scenario) => void) =>
    mutate((d) => {
      fn(d.scenarios.find((x) => x.id === s.id)!);
    });

  const duplicate = () => {
    const free = 'ABCDEF'.split('').find((l) => !data.scenarios.some((x) => x.id === l));
    if (!free) return;
    mutate((d) => {
      const copy = structuredClone(s);
      copy.id = free;
      copy.name = `${s.name} (variante)`;
      copy.legs.forEach((l, i) => (l.id = `${free}${i + 1}-${uid('')}`));
      d.scenarios.push(copy);
    });
    setCur(free);
  };
  const remove = () => {
    if (data.scenarios.length <= 1 || !window.confirm(`¿Eliminar el escenario ${s.id}? No se puede deshacer (salvo con un respaldo).`)) return;
    const next = data.scenarios.find((x) => x.id !== s.id)!.id;
    mutate((d) => {
      d.scenarios = d.scenarios.filter((x) => x.id !== s.id);
      if (d.settings.selectedScenarioId === s.id) d.settings.selectedScenarioId = next;
    });
    setCur(next);
  };

  return (
    <Section title="Escenarios: tramos y noches" open>
      <div className="row-between">
        <div className="toggle" role="group" aria-label="Escenario a editar">
          {data.scenarios.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === s.id} onClick={() => setCur(x.id)}>
              {x.id}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={duplicate} disabled={data.scenarios.length >= 6}>
            Duplicar {s.id}
          </button>
          <button type="button" className="btn danger" onClick={remove} disabled={data.scenarios.length <= 1}>
            Eliminar {s.id}
          </button>
        </div>
      </div>

      <div className="grid-fields">
        <TextField label="Nombre" value={s.name} validate={(v) => (v.trim() ? null : 'Requerido')} onChange={(v) => edit((sc) => void (sc.name = v))} />
        <SelectField
          label="Tipo"
          value={s.kind}
          options={[
            { value: 'abierto', label: 'Ruta abierta (entra por un punto, sale por otro)' },
            { value: 'ida_vuelta', label: 'Ida y vuelta por Madrid' },
          ]}
          onChange={(v) => edit((sc) => void (sc.kind = v))}
        />
      </div>
      <TextField label="Resumen" multiline value={s.summary} onChange={(v) => edit((sc) => void (sc.summary = v))} />

      <h3 className="ed-h3">Tramos en orden</h3>
      <ol className="ed-list">
        {s.legs.map((l, i) => (
          <li key={l.id}>
            <LegEditor
              leg={l}
              index={i}
              total={s.legs.length}
              placeOpts={placeOpts}
              name={name}
              onChange={(nl) => edit((sc) => void (sc.legs[i] = nl))}
              onMove={(dir) =>
                edit((sc) => {
                  const j = i + dir;
                  [sc.legs[i], sc.legs[j]] = [sc.legs[j]!, sc.legs[i]!];
                })
              }
              onRemove={() => edit((sc) => void sc.legs.splice(i, 1))}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        onClick={() =>
          edit((sc) => {
            const from = sc.legs[sc.legs.length - 1]?.to ?? data.settings.hubPlaceIds[0]!;
            sc.legs.push({ id: uid(`${sc.id}-`), from, to: data.settings.hubPlaceIds[0]!, mode: 'tren', hours: 1, cost: newCost() });
          })
        }
      >
        + Agregar tramo
      </button>

      <h3 className="ed-h3">Noches</h3>
      <ol className="ed-list">
        {s.stays.map((st, i) => (
          <li key={`${st.placeId}-${i}`}>
            <StayEditor
              stay={st}
              placeOpts={placeOpts}
              name={name}
              onChange={(ns) => edit((sc) => void (sc.stays[i] = ns))}
              onRemove={() => edit((sc) => void sc.stays.splice(i, 1))}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        onClick={() =>
          edit((sc) =>
            void sc.stays.push({
              placeId: sc.legs.find((l) => !data.settings.hubPlaceIds.includes(l.to))?.to ?? data.places[0]!.id,
              nights: 1,
              lodgingPerNight: newCost(),
              mealsPerDay: newCost(),
              localPerDay: newCost(),
            }),
          )
        }
      >
        + Agregar noches en un lugar
      </button>
      <p className="muted small">Si un lugar aparece dos veces (por ejemplo, Chur antes y después del Bernina), sus noches se usan en el orden de los tramos.</p>
    </Section>
  );
}

function LegEditor({
  leg,
  index,
  total,
  placeOpts,
  name,
  onChange,
  onMove,
  onRemove,
}: {
  leg: Leg;
  index: number;
  total: number;
  placeOpts: { value: string; label: string }[];
  name: (id: string) => string;
  onChange: (l: Leg) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Leg>) => {
    const next = { ...leg, ...patch };
    if (!next.label) delete next.label;
    if (!next.risk) delete next.risk;
    onChange(next);
  };
  return (
    <details className="ed-item">
      <summary>
        <span className="ed-num">{index + 1}</span>
        <span>
          <strong>
            {name(leg.from)} → {name(leg.to)}
          </strong>
          <span className="muted">
            {' '}
            · {MODE_LABEL[leg.mode]} · {hours(leg.hours)}
            {leg.label ? ` · ${leg.label}` : ''}
          </span>
        </span>
      </summary>
      <div className="ed-item-body">
        <div className="grid-fields">
          <SelectField label="Desde" value={leg.from} options={placeOpts} onChange={(v) => set({ from: v })} />
          <SelectField label="Hasta" value={leg.to} options={placeOpts} onChange={(v) => set({ to: v })} />
          <SelectField label="Modo" value={leg.mode} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} onChange={(v) => set({ mode: v })} />
          <NumberField label="Horas puerta a puerta" min={0.25} max={48} value={leg.hours} onChange={(n) => n && set({ hours: n })} />
          <TextField label="Nombre del tren o vuelo" placeholder="Bernina Express" value={leg.label ?? ''} onChange={(v) => set({ label: v || undefined })} />
        </div>
        <CostEditor title="Costo del tramo (3 personas)" cost={leg.cost} onChange={(c) => set({ cost: c })} />
        <TextField label="Riesgo conocido" multiline value={leg.risk ?? ''} onChange={(v) => set({ risk: v || undefined })} />
        <div className="row">
          <button type="button" className="btn" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑ Subir
          </button>
          <button type="button" className="btn" disabled={index === total - 1} onClick={() => onMove(1)}>
            ↓ Bajar
          </button>
          <button type="button" className="btn danger" onClick={onRemove}>
            Eliminar tramo
          </button>
        </div>
      </div>
    </details>
  );
}

function StayEditor({
  stay,
  placeOpts,
  name,
  onChange,
  onRemove,
}: {
  stay: Stay;
  placeOpts: { value: string; label: string }[];
  name: (id: string) => string;
  onChange: (s: Stay) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Stay>) => onChange({ ...stay, ...patch });
  return (
    <details className="ed-item">
      <summary>
        <span className="ed-num">{stay.nights}</span>
        <span>
          <strong>{name(stay.placeId)}</strong>
          <span className="muted"> · {stay.nights === 1 ? 'noche' : 'noches'}</span>
        </span>
      </summary>
      <div className="ed-item-body">
        <div className="grid-fields">
          <SelectField label="Lugar" value={stay.placeId} options={placeOpts} onChange={(v) => set({ placeId: v })} />
          <NumberField label="Noches" integer min={0} max={30} value={stay.nights} onChange={(n) => set({ nights: n ?? 0 })} />
        </div>
        <CostEditor title="Hotel" per="/ noche" cost={stay.lodgingPerNight} onChange={(c) => set({ lodgingPerNight: c })} />
        <CostEditor title="Comidas (familia)" per="/ día" cost={stay.mealsPerDay} onChange={(c) => set({ mealsPerDay: c })} />
        <CostEditor title="Transporte local y entradas" per="/ día" cost={stay.localPerDay} onChange={(c) => set({ localPerDay: c })} />
        <button type="button" className="btn danger" onClick={onRemove}>
          Eliminar estas noches
        </button>
      </div>
    </details>
  );
}

/* ---------------- Comunes, extras, lugares, alertas ---------------- */

function CommonEditor() {
  const { data, mutate } = useTrip();
  return (
    <Section title="Costos comunes (vuelos largos, seguro)">
      <ol className="ed-list">
        {data.common.map((c, i) => (
          <li key={c.id} className="ed-flat">
            <TextField label="Concepto" value={c.label} validate={(v) => (v.trim() ? null : 'Requerido')} onChange={(v) => mutate((d) => void (d.common[i]!.label = v))} />
            <CostEditor title={c.label} cost={c.cost} onChange={(nc) => mutate((d) => void (d.common[i]!.cost = nc))} />
            <button type="button" className="btn danger" onClick={() => mutate((d) => void d.common.splice(i, 1))}>
              Eliminar
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={() => mutate((d) => void d.common.push({ id: uid('c'), label: 'Nuevo costo', cost: newCost() }))}>
        + Agregar costo común
      </button>
    </Section>
  );
}

function ExtrasEditor() {
  const { data, mutate } = useTrip();
  const placeOpts = data.places.map((p) => ({ value: p.id, label: p.name }));
  return (
    <Section title="Extras posibles (Toledo, Barcelona, Portugal…)">
      <ol className="ed-list">
        {data.extras.map((e, i) => (
          <li key={e.id} className="ed-flat">
            <div className="grid-fields">
              <TextField label="Nombre" value={e.name} validate={(v) => (v.trim() ? null : 'Requerido')} onChange={(v) => mutate((d) => void (d.extras[i]!.name = v))} />
              <SelectField label="Lugar" value={e.placeId} options={placeOpts} onChange={(v) => mutate((d) => void (d.extras[i]!.placeId = v))} />
              <NumberField label="Días mínimos" integer min={1} max={30} value={e.minDays} onChange={(n) => n && mutate((d) => void (d.extras[i]!.minDays = n))} />
            </div>
            <TextField label="Qué incluye" value={e.summary} onChange={(v) => mutate((d) => void (d.extras[i]!.summary = v))} />
            <CostEditor title={`Costo total de ${e.name}`} cost={e.cost} onChange={(c) => mutate((d) => void (d.extras[i]!.cost = c))} />
            <button type="button" className="btn danger" onClick={() => mutate((d) => void d.extras.splice(i, 1))}>
              Eliminar extra
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        onClick={() => mutate((d) => void d.extras.push({ id: uid('x'), name: 'Nuevo extra', placeId: d.places[0]!.id, minDays: 1, cost: newCost(), summary: '' }))}
      >
        + Agregar extra
      </button>
    </Section>
  );
}

function PlacesEditor() {
  const { data, mutate } = useTrip();
  const used = new Set([
    ...data.settings.hubPlaceIds,
    ...data.scenarios.flatMap((s) => [...s.legs.flatMap((l) => [l.from, l.to]), ...s.stays.map((st) => st.placeId)]),
    ...data.extras.map((e) => e.placeId),
  ]);
  return (
    <Section title="Lugares y coordenadas">
      <p className="muted small">Las coordenadas sirven para el mapa. Puedes copiarlas de OpenStreetMap o Google Maps (latitud, longitud).</p>
      <ol className="ed-list">
        {data.places.map((p, i) => (
          <li key={p.id} className="ed-flat place-row">
            <div className="grid-fields">
              <TextField label="Nombre" value={p.name} validate={(v) => (v.trim() ? null : 'Requerido')} onChange={(v) => mutate((d) => void (d.places[i]!.name = v))} />
              <TextField label="País" value={p.country} onChange={(v) => mutate((d) => void (d.places[i]!.country = v))} />
              <NumberField label="Latitud" min={-90} max={90} value={p.lat} onChange={(n) => n !== undefined && mutate((d) => void (d.places[i]!.lat = n))} />
              <NumberField label="Longitud" min={-180} max={180} value={p.lng} onChange={(n) => n !== undefined && mutate((d) => void (d.places[i]!.lng = n))} />
            </div>
            <button
              type="button"
              className="btn danger"
              disabled={used.has(p.id)}
              title={used.has(p.id) ? 'Está en uso en algún escenario o extra' : undefined}
              onClick={() => mutate((d) => void d.places.splice(i, 1))}
            >
              {used.has(p.id) ? 'En uso' : 'Eliminar'}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        onClick={() =>
          mutate((d) => {
            const id = slug('nuevo lugar', new Set(d.places.map((x) => x.id)));
            d.places.push({ id, name: 'Nuevo lugar', country: '', lat: 46, lng: 8 });
          })
        }
      >
        + Agregar lugar
      </button>
    </Section>
  );
}

function AlertsEditor() {
  const { data, mutate } = useTrip();
  const ids = new Set(data.places.map((p) => p.id));
  return (
    <Section title="Alertas de calendario (temporadas, festivos, obras)">
      <p className="muted small">El itinerario las muestra en los días que coinciden con sus fechas y lugares.</p>
      <ol className="ed-list">
        {data.alerts.map((a, i) => (
          <li key={a.id} className="ed-flat">
            <div className="grid-fields">
              <TextField label="Desde" type="date" value={a.from} validate={(v) => (v ? isDateOrEmpty(v) : 'Requerido')} onChange={(v) => mutate((d) => void (d.alerts[i]!.from = v))} />
              <TextField label="Hasta" type="date" value={a.to} validate={(v) => (v ? isDateOrEmpty(v) : 'Requerido')} onChange={(v) => mutate((d) => void (d.alerts[i]!.to = v))} />
              <SelectField
                label="Nivel"
                value={a.level}
                options={[
                  { value: 'info', label: 'Información' },
                  { value: 'aviso', label: 'Aviso' },
                ]}
                onChange={(v) => mutate((d) => void (d.alerts[i]!.level = v))}
              />
              <TextField
                label="Lugares (ids, separados por coma; vacío = todos)"
                value={a.placeIds.join(', ')}
                validate={(v) => {
                  const bad = v.split(',').map((x) => x.trim()).filter((x) => x && !ids.has(x));
                  return bad.length ? `No existen: ${bad.join(', ')}` : null;
                }}
                onChange={(v) => mutate((d) => void (d.alerts[i]!.placeIds = v.split(',').map((x) => x.trim()).filter(Boolean)))}
              />
            </div>
            <TextField label="Mensaje" multiline value={a.message} validate={(v) => (v.trim() ? null : 'Requerido')} onChange={(v) => mutate((d) => void (d.alerts[i]!.message = v))} />
            <TextField label="Fuente" type="url" value={a.source ?? ''} validate={isUrlOrEmpty} onChange={(v) => mutate((d) => void (d.alerts[i]!.source = v.trim() || undefined))} />
            <button type="button" className="btn danger" onClick={() => mutate((d) => void d.alerts.splice(i, 1))}>
              Eliminar alerta
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        onClick={() => mutate((d) => void d.alerts.push({ id: uid('a'), from: d.settings.startDate, to: d.settings.startDate, placeIds: [], level: 'info', message: 'Nueva alerta' }))}
      >
        + Agregar alerta
      </button>
    </Section>
  );
}

/* ---------------- Compartir, historial y respaldo ---------------- */

function Backup() {
  const { data, replace, reset, repo, sync } = useTrip();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [author, setAuthorState] = useState(getAuthor);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [loadingV, setLoadingV] = useState(false);

  const download = () => {
    const blob = new Blob([exportTrip(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eurotrip-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({ ok: true, text: 'Respaldo descargado.' });
  };
  const load = async (f: File) => {
    const r = importTrip(await f.text());
    if (!r.ok) return setMsg({ ok: false, text: `No se importó: ${r.errors.slice(0, 3).join(' · ')}` });
    if (!window.confirm('¿Reemplazar los datos de toda la familia por los del respaldo? (Queda en el historial y se puede deshacer.)')) return;
    replace(r.data);
    setMsg({ ok: true, text: 'Datos importados para todos.' });
  };
  const showVersions = async () => {
    setLoadingV(true);
    try {
      setVersions(await repo.versions());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo leer el historial' });
    } finally {
      setLoadingV(false);
    }
  };
  const restore = async (v: VersionInfo) => {
    if (!window.confirm(`¿Volver a la versión ${v.revision} (${fmtWhen(v.updatedAt)}${v.updatedBy ? `, ${v.updatedBy}` : ''}) para toda la familia?`)) return;
    try {
      replace(await repo.version(v.revision));
      setMsg({ ok: true, text: `Versión ${v.revision} restaurada. La versión actual queda en el historial.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo restaurar' });
    }
  };
  const shared = sync.status !== 'solo_local';

  return (
    <Section title="Compartir, historial y respaldo">
      <p className="muted small">
        {shared
          ? 'Los datos son los mismos para toda la familia: lo que cambie una persona lo ven las demás (se actualiza al abrir la app y cada minuto).'
          : 'Este entorno no tiene servicio compartido: los datos quedan solo en este navegador.'}
      </p>
      <TextField
        label="Tu nombre en este dispositivo (aparece en el historial)"
        placeholder="Juan"
        value={author}
        onChange={(v) => {
          setAuthorState(v);
          setAuthor(v);
        }}
      />

      {shared && (
        <div className="history">
          <div className="row">
            <button type="button" className="btn" onClick={() => void showVersions()} disabled={loadingV}>
              {loadingV ? 'Cargando…' : versions ? 'Actualizar historial' : 'Ver historial de cambios'}
            </button>
          </div>
          {versions && versions.length === 0 && <p className="muted small">Aún no hay versiones guardadas.</p>}
          {versions && versions.length > 0 && (
            <ol className="versions">
              {versions.map((v) => (
                <li key={v.revision}>
                  <span>
                    <strong>v{v.revision}</strong> · {fmtWhen(v.updatedAt)}
                    {v.updatedBy ? ` · ${v.updatedBy}` : ''}
                    {v.revision === sync.revision && <span className="badge cotizado">Actual</span>}
                  </span>
                  {v.revision !== sync.revision && (
                    <button type="button" className="btn" onClick={() => void restore(v)}>
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="row">
        <button type="button" className="btn primary" onClick={download}>
          Descargar respaldo (.json)
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Cargar respaldo
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (window.confirm('¿Volver a los datos de referencia originales para toda la familia? La versión actual queda en el historial.')) {
              void reset().then(() => setMsg({ ok: true, text: 'Datos restablecidos.' }));
            }
          }}
        >
          Restablecer datos de referencia
        </button>
      </div>
      {msg && (
        <p role="status" className={msg.ok ? 'ok-line' : 'field-error'}>
          {msg.text}
        </p>
      )}
    </Section>
  );
}
