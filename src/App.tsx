import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Header } from './components/Header';
import { Pulse } from './components/Pulse';
import { Tabs } from './components/Tabs';
import { Datos } from './modules/datos/Datos';
import { DiasLibres } from './modules/dias-libres/DiasLibres';
import { Itinerario } from './modules/itinerario/Itinerario';
import { Presupuesto } from './modules/presupuesto/Presupuesto';
import { Simulador } from './modules/simulador/Simulador';
import { Tasa } from './modules/tasa/Tasa';
import { Asistente } from './modules/asistente/Asistente';
// El mapa (Leaflet) se descarga solo al abrir ese módulo.
const Mapa = lazy(() => import('./modules/mapa/Mapa').then((m) => ({ default: m.Mapa })));
import { useRoute, type ModuleId } from './lib/route';
import { useTrip } from './lib/store';

const VIEWS: Record<ModuleId, () => ReactNode> = {
  simulador: () => <Simulador />,
  mapa: () => (
    <Suspense fallback={<section className="panel" aria-busy="true"><h2>Mapa</h2><p className="muted">Cargando mapa…</p></section>}>
      <Mapa />
    </Suspense>
  ),
  presupuesto: () => <Presupuesto />,
  itinerario: () => <Itinerario />,
  'dias-libres': () => <DiasLibres />,
  datos: () => <Datos />,
  tasa: () => <Tasa />,
};

/** Botón flotante en celular; se oculta cuando el asistente ya está a la vista. */
function AssistantFab() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = document.getElementById('asistente');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (visible) return null;
  return (
    <a className="fab" href="#asistente" onClick={() => setTimeout(() => document.getElementById('ai-q')?.focus(), 300)}>
      Preguntar al asistente
    </a>
  );
}

export function App() {
  const route = useRoute();
  const { data, saveError, notice, dismissNotice } = useTrip();

  // Al cambiar de módulo, volver arriba del contenido.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <Header />
      <Tabs current={route} />
      <Pulse />
      <div className="layout">
        <main id="contenido" tabIndex={-1}>
          {saveError && <div className="notice error">{saveError}</div>}
          {notice && (
            <div className="notice sync-notice" role="status">
              <span>{notice}</span>
              <button type="button" className="btn" onClick={dismissNotice}>
                Entendido
              </button>
            </div>
          )}
          {VIEWS[route]()}
        </main>
        <Asistente />
      </div>
      <AssistantFab />
      <footer className="foot">
        Precios estimados para octubre de 2027: referencias consultadas el 2 nov 2026, proyectadas con +{data.settings.priceAdjustPct} % de inflación. Los
        precios cotizados o reservados se usan tal cual.
      </footer>
    </>
  );
}
