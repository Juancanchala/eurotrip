import { useEffect, type ReactNode } from 'react';
import { Header } from './components/Header';
import { Pulse } from './components/Pulse';
import { Tabs } from './components/Tabs';
import { Datos } from './modules/datos/Datos';
import { DiasLibres } from './modules/dias-libres/DiasLibres';
import { Itinerario } from './modules/itinerario/Itinerario';
import { Presupuesto } from './modules/presupuesto/Presupuesto';
import { Simulador } from './modules/simulador/Simulador';
import { Tasa } from './modules/tasa/Tasa';
import { useRoute, type ModuleId } from './lib/route';
import { useTrip } from './lib/store';

function Soon({ title, step, what }: { title: string; step: number; what: string }) {
  return (
    <section className="panel" aria-labelledby="soon-title">
      <h2 id="soon-title">{title}</h2>
      <div className="soon">
        <strong>Se construye en el paso {step}</strong>
        <span>{what}</span>
      </div>
    </section>
  );
}

const VIEWS: Record<ModuleId, () => ReactNode> = {
  simulador: () => <Simulador />,
  mapa: () => <Soon title="Mapa" step={5} what="Mapa con la ruta del escenario, tramos y popups por parada." />,
  presupuesto: () => <Presupuesto />,
  itinerario: () => <Itinerario />,
  'dias-libres': () => <DiasLibres />,
  datos: () => <Datos />,
  tasa: () => <Tasa />,
};

export function App() {
  const route = useRoute();
  const { data, saveError } = useTrip();

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
          {VIEWS[route]()}
        </main>
        <aside className="assistant" aria-label="Asistente de viaje">
          <div className="assistant-head">
            <strong>Asistente de viaje</strong>
            <span>Conoce tus escenarios y tu presupuesto</span>
          </div>
          <div className="assistant-body">
            <p>Se conecta en el paso 6. Responderá con cálculos del motor, nunca con cifras inventadas.</p>
          </div>
        </aside>
      </div>
      <footer className="foot">
        Precios estimados para octubre de 2027: referencias consultadas el 2 nov 2026, proyectadas con +{data.settings.priceAdjustPct} % de inflación. Los
        precios cotizados o reservados se usan tal cual.
      </footer>
    </>
  );
}
