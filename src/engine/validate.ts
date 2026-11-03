import type { TripData } from './types';

export interface Issue {
  level: 'error' | 'aviso';
  where: string;
  message: string;
}

/**
 * Reglas de coherencia que un esquema de forma no puede verificar:
 * referencias a lugares, continuidad de tramos y rangos coherentes.
 */
export function validateTrip(data: TripData): Issue[] {
  const issues: Issue[] = [];
  const places = new Set(data.places.map((p) => p.id));
  const { settings } = data;

  for (const h of settings.hubPlaceIds) {
    if (!places.has(h)) issues.push({ level: 'error', where: 'Ajustes', message: `El lugar base "${h}" no existe` });
  }
  if (!data.scenarios.some((s) => s.id === settings.selectedScenarioId)) {
    issues.push({ level: 'error', where: 'Ajustes', message: 'El escenario seleccionado no existe' });
  }
  if (settings.travelers.childAges.length !== settings.travelers.children) {
    issues.push({ level: 'aviso', where: 'Viajeros', message: 'El número de edades no coincide con el número de niños' });
  }

  const ids = new Set<string>();
  for (const s of data.scenarios) {
    const where = `Escenario ${s.id}`;
    if (ids.has(s.id)) issues.push({ level: 'error', where, message: 'Id de escenario repetido' });
    ids.add(s.id);

    s.legs.forEach((l, i) => {
      for (const p of [l.from, l.to]) {
        if (!places.has(p)) issues.push({ level: 'error', where, message: `Tramo ${i + 1}: el lugar "${p}" no existe` });
      }
      const prev = s.legs[i - 1];
      if (prev && prev.to !== l.from) {
        issues.push({ level: 'aviso', where, message: `Tramo ${i + 1} sale de un lugar distinto a donde llegó el anterior` });
      }
    });
    const first = s.legs[0];
    const last = s.legs[s.legs.length - 1];
    if (first && !settings.hubPlaceIds.includes(first.from)) {
      issues.push({ level: 'aviso', where, message: 'El recorrido no sale de casa (Madrid/Guadarrama)' });
    }
    if (last && !settings.hubPlaceIds.includes(last.to)) {
      issues.push({ level: 'aviso', where, message: 'El recorrido no termina en casa (Madrid/Guadarrama)' });
    }
    for (const st of s.stays) {
      if (!places.has(st.placeId)) issues.push({ level: 'error', where, message: `Estadía en lugar inexistente "${st.placeId}"` });
      const visited = s.legs.some((l) => l.to === st.placeId);
      if (!visited) issues.push({ level: 'aviso', where, message: `Hay noches en "${st.placeId}" pero ningún tramo llega allí` });
    }
  }

  if (data.scenarios.length === 0) issues.push({ level: 'error', where: 'Escenarios', message: 'No hay escenarios' });

  const checkRange = (where: string, c: { eur: number; min?: number; max?: number }) => {
    if ((c.min ?? c.eur) > c.eur || c.eur > (c.max ?? c.eur)) {
      issues.push({ level: 'aviso', where, message: 'El rango no cumple mínimo ≤ valor ≤ máximo; se reordena al calcular' });
    }
  };
  for (const s of data.scenarios) {
    s.legs.forEach((l, i) => checkRange(`Escenario ${s.id} · tramo ${i + 1}`, l.cost));
    for (const st of s.stays) {
      checkRange(`Escenario ${s.id} · ${st.placeId}`, st.lodgingPerNight);
      checkRange(`Escenario ${s.id} · ${st.placeId}`, st.mealsPerDay);
      checkRange(`Escenario ${s.id} · ${st.placeId}`, st.localPerDay);
    }
  }
  for (const c of data.common) checkRange(c.label, c.cost);
  for (const a of data.alerts) {
    if (a.from > a.to) issues.push({ level: 'error', where: `Alerta ${a.id}`, message: 'La fecha inicial es posterior a la final' });
    for (const p of a.placeIds) if (!places.has(p)) issues.push({ level: 'aviso', where: `Alerta ${a.id}`, message: `Lugar "${p}" no existe` });
  }

  for (const e of data.extras) {
    if (!places.has(e.placeId)) issues.push({ level: 'error', where: `Extra ${e.name}`, message: `Lugar "${e.placeId}" no existe` });
  }
  return issues;
}
