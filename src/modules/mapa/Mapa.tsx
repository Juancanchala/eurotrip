import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { buildItinerary, findScenario, formatMoney, nightsByPlace, priceCtx, projected, scale, stopsOf, add, type Leg, type Range } from '../../engine';
import { Money } from '../../components/Money';
import { fmtDay, fmtSpan, hours, MODE_LABEL, plural } from '../../lib/format';
import { useTrip } from '../../lib/store';
import { arc, legColor, type LatLng } from './geometry';

/** Crea un elemento con texto (nunca HTML), para popups seguros con datos editables. */
function el(tag: string, text?: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (className) e.className = className;
  return e;
}

export function Mapa() {
  const { data, mutate, currency, rate } = useTrip();
  const s = findScenario(data);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const places = new Map(data.places.map((p) => [p.id, p]));
  const name = (id: string) => places.get(id)?.name ?? id;
  const ctx = priceCtx(data.settings);
  const it = buildItinerary(data, s);
  const legDate = new Map<string, string>();
  for (const d of it.days) for (const l of d.legs) legDate.set(l.id, d.date);
  const nights = nightsByPlace(s);

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { scrollWheelZoom: false, zoomSnap: 0.25 }).setView([45.5, 4], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Redibujar la ruta cuando cambia el escenario o los datos.
  const fingerprint = JSON.stringify([s, data.places, data.settings.hubPlaceIds, currency, rate, data.settings.priceAdjustPct]);
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: LatLng[] = [];
    const at = (id: string): LatLng | null => {
      const p = places.get(id);
      return p ? [p.lat, p.lng] : null;
    };

    s.legs.forEach((l, i) => {
      const a = at(l.from);
      const b = at(l.to);
      if (!a || !b) return;
      const path = l.mode === 'vuelo' ? arc(a, b, 0.18) : arc(a, b, 0.04);
      const line = L.polyline(path, {
        color: legColor(i),
        weight: l.mode === 'vuelo' ? 3.5 : 5,
        opacity: 0.95,
        dashArray: l.mode === 'vuelo' ? '9 9' : undefined,
        lineCap: 'round',
      }).addTo(g);
      const tip = el('div');
      tip.append(el('strong', `${i + 1}. ${name(l.from)} → ${name(l.to)}`), el('br'), el('span', `${MODE_LABEL[l.mode]} · ${hours(l.hours)}`));
      line.bindTooltip(tip, { sticky: true });
      pts.push(a, b);
    });

    // Paradas con popup: noches, fechas y costo de la estadía.
    const hubs = new Set(data.settings.hubPlaceIds);
    const stops = new Set([...stopsOf(s), ...data.settings.hubPlaceIds]);
    for (const id of stops) {
      const c = at(id);
      if (!c) continue;
      const isHub = hubs.has(id);
      const n = nights[id] ?? 0;
      const stays = s.stays.filter((st) => st.placeId === id && st.nights > 0);
      const stayCost: Range = add(
        ...stays.map((st) =>
          scale(add(projected(st.lodgingPerNight, ctx), projected(st.mealsPerDay, ctx), projected(st.localPerDay, ctx)), st.nights),
        ),
      );
      const dates = it.days.filter((d) => d.kind === 'ruta' && d.sleepAt === id).map((d) => d.date);

      const pop = el('div', undefined, 'map-pop');
      pop.append(el('strong', name(id)));
      if (isHub) pop.append(el('span', 'Base familiar (Madrid/Guadarrama)'));
      if (n > 0) {
        pop.append(el('span', `${plural(n, 'noche', 'noches')}${dates.length ? ` · ${fmtSpan(dates[0]!, dates[dates.length - 1]!)}` : ''}`));
        pop.append(el('span', `Estadía: ${formatMoney(stayCost.eur, currency, rate)} (hotel, comidas y local)`));
      } else if (!isHub) {
        pop.append(el('span', 'Paso, sin noche'));
      }
      const note = places.get(id)?.note;
      if (note) pop.append(el('em', note));

      // Etiqueta fija solo donde se duerme y en la base principal; las paradas de paso se ven al tocarlas.
      const mainHub = id === data.settings.hubPlaceIds[0];
      const permanent = n > 0 || mainHub;
      const label = el('span', n > 0 ? `${name(id)} · ${n}n` : mainHub ? `${name(id)} · base` : name(id));
      L.circleMarker(c, {
        radius: isHub ? 8 : n > 0 ? 9 : 6,
        color: '#0F2A3D',
        weight: 3,
        fillColor: isHub ? '#C2410C' : '#FFFFFF',
        fillOpacity: 1,
      })
        .bindTooltip(label, { permanent, direction: 'top', offset: [0, -8], className: 'map-label' })
        .bindPopup(pop)
        .addTo(g);
      pts.push(c);
    }

    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 7 });
    // El contenedor puede haber cambiado de tamaño al entrar al módulo.
    const t = setTimeout(() => m.invalidateSize(), 120);
    return () => clearTimeout(t);
    // fingerprint resume todo lo que afecta al dibujo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const legCost = (l: Leg) => projected(l.cost, ctx).eur;

  return (
    <>
      <section className="panel" aria-labelledby="map-title">
        <div className="panel-head">
          <div>
            <h2 id="map-title">Mapa · Escenario {s.id}</h2>
            <p>{s.name}</p>
          </div>
          <div className="toggle" role="group" aria-label="Escenario en el mapa">
            {data.scenarios.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={x.id === s.id}
                onClick={() =>
                  mutate((d) => {
                    d.settings.selectedScenarioId = x.id;
                  })
                }
              >
                {x.id}
              </button>
            ))}
          </div>
        </div>
        <div className="mapwrap">
          <div ref={box} className="map" role="region" aria-label={`Mapa de la ruta del escenario ${s.id}. La lista de tramos está debajo.`} />
        </div>
        <p className="legend">
          <span className="lg-train" /> Tren <span className="lg-fly" /> Vuelo <span className="lg-hub" /> Base familiar · Toca una parada para ver noches,
          fechas y costo.
        </p>
      </section>

      <section className="panel" aria-labelledby="legs-title">
        <h2 id="legs-title">Tramos en orden</h2>
        <ol className="map-legs">
          {s.legs.map((l, i) => {
            const date = legDate.get(l.id);
            return (
              <li key={l.id}>
                <span className="map-num" style={{ background: legColor(i) }}>
                  {i + 1}
                </span>
                <div className="map-leg-body">
                  <strong>
                    {name(l.from)} → {name(l.to)}
                  </strong>
                  <span className="muted small">
                    <span className={`mode ${l.mode}`}>{MODE_LABEL[l.mode]}</span> {l.label ? `${l.label} · ` : ''}
                    {hours(l.hours)}
                    {date ? ` · ${fmtDay(date)}` : ''}
                  </span>
                  {l.risk && <span className="day-risk">⚠ {l.risk}</span>}
                </div>
                <span className="map-leg-cost">
                  <Money eur={legCost(l)} />
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted small">
          Total en traslados: {hours(s.legs.reduce((a, l) => a + l.hours, 0))} ·{' '}
          <Money eur={s.legs.reduce((a, l) => a + legCost(l), 0)} />
        </p>
      </section>
    </>
  );
}
