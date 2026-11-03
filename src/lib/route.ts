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

/** Solo los hash con forma "#/módulo" son rutas; "#asistente" o "#contenido" son anclas de la página. */
function parse(): ModuleId | null {
  const h = window.location.hash;
  if (h && !h.startsWith('#/')) return null;
  const id = h.slice(2);
  return (MODULES.find((m) => m.id === id)?.id ?? 'simulador') as ModuleId;
}

/** Ruteo por hash: funciona en Netlify sin reglas de redirección. */
export function useRoute(): ModuleId {
  const [route, setRoute] = useState<ModuleId>(() => parse() ?? 'simulador');
  useEffect(() => {
    const on = () => {
      const r = parse();
      if (r) setRoute(r);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
