import type { Scenario, Settings } from './types';

/** Noches fuera de casa en el escenario. */
export function nightsAway(s: Scenario): number {
  return s.stays.reduce((a, st) => a + st.nights, 0);
}

/** Cuántas veces el escenario vuelve a casa (Madrid/Guadarrama). */
export function returnsHome(s: Scenario, hubPlaceIds: string[]): number {
  return s.legs.filter((l) => hubPlaceIds.includes(l.to)).length;
}

/**
 * Días de calendario que consume el escenario.
 * Cada salida desde casa usa sus noches + 1 (el día de regreso).
 */
export function daysUsed(s: Scenario, settings: Pick<Settings, 'hubPlaceIds'>): number {
  return nightsAway(s) + returnsHome(s, settings.hubPlaceIds);
}

/** Días libres en casa. Puede ser negativo: el escenario no cabe. */
export function freeDays(s: Scenario, settings: Settings): number {
  return settings.totalDays - settings.fixedDays - daysUsed(s, settings);
}

export function hoursInTransit(s: Scenario): number {
  return s.legs.reduce((a, l) => a + l.hours, 0);
}

/** Noches por lugar (suma si el lugar aparece más de una vez). */
export function nightsByPlace(s: Scenario): Record<string, number> {
  const out: Record<string, number> = {};
  for (const st of s.stays) out[st.placeId] = (out[st.placeId] ?? 0) + st.nights;
  return out;
}

/** Paradas en orden de recorrido, sin repetir consecutivas. */
export function stopsOf(s: Scenario): string[] {
  const first = s.legs[0];
  if (!first) return s.stays.map((st) => st.placeId);
  const list = [first.from];
  for (const l of s.legs) if (list[list.length - 1] !== l.to) list.push(l.to);
  return list;
}
