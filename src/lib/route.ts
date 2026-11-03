import { useEffect, useState } from 'react';

export const MODULES = [
  { id: 'simulador', label: 'Simulador' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'itinerario', label: 'Itinerario' },
  { id: 'dias-libres', label: 'Días libres' },
  { id: 'datos', label: 'Datos y precios' },
  { id: 'tasa', label: 'Tasa y supuestos' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

function parse(): ModuleId {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (MODULES.find((m) => m.id === h)?.id ?? 'simulador') as ModuleId;
}

/** Ruteo por hash: funciona en Netlify sin reglas de redirección. */
export function useRoute(): ModuleId {
  const [route, setRoute] = useState<ModuleId>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
