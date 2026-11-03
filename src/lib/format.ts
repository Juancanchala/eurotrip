import type { Mode, TripData } from '../engine/types';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function parts(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dow: DOW[d.getUTCDay()]!, day: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()]!, year: d.getUTCFullYear() };
}

/** "sáb 9 oct" */
export function fmtDay(iso: string): string {
  const p = parts(iso);
  return `${p.dow} ${p.day} ${p.mon}`;
}

/** "9 oct 2027" */
export function fmtDate(iso: string): string {
  const p = parts(iso);
  return `${p.day} ${p.mon} ${p.year}`;
}

/** "9–14 oct" o "28 oct – 2 nov" */
export function fmtSpan(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${a.day} ${a.mon}`;
  return a.mon === b.mon ? `${a.day}–${b.day} ${a.mon}` : `${a.day} ${a.mon} – ${b.day} ${b.mon}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function hours(h: number): string {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole} h ${min}` : `${whole} h`;
}

export const MODE_LABEL: Record<Mode, string> = { tren: 'Tren', vuelo: 'Vuelo', bus: 'Bus', auto: 'Auto' };

export function placeNamer(data: TripData): (id: string) => string {
  const m = new Map(data.places.map((p) => [p.id, p.name]));
  return (id) => m.get(id) ?? id;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
