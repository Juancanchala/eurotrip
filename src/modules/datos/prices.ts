import type { Cost, CostStatus, TripData } from '../../engine/types';

/** Dónde vive un costo dentro de los datos. */
export type CostRef =
  | { kind: 'common'; i: number }
  | { kind: 'leg'; s: number; i: number }
  | { kind: 'stay'; s: number; i: number; field: 'lodgingPerNight' | 'mealsPerDay' | 'localPerDay' }
  | { kind: 'extra'; i: number }
  | { kind: 'home' };

export type PriceSection = 'comunes' | 'vuelos' | 'trenes' | 'hoteles' | 'comidas' | 'local' | 'extras' | 'casa';

export const SECTION_LABEL: Record<PriceSection, string> = {
  comunes: 'Vuelos largos y costos comunes',
  vuelos: 'Vuelos en Europa',
  trenes: 'Trenes, buses y autos',
  hoteles: 'Hoteles (por noche, familia)',
  comidas: 'Comidas (por día, familia)',
  local: 'Transporte local y entradas (por día)',
  extras: 'Extras',
  casa: 'Días en casa',
};

export interface PriceGroup {
  key: string;
  section: PriceSection;
  label: string;
  detail?: string;
  /** Escenarios donde aparece (vacío para costos que no son de escenario). */
  scenarios: string[];
  per?: string;
  refs: CostRef[];
  /** true si los miembros del grupo tienen valores distintos. */
  mixed: boolean;
}

export function getCost(d: TripData, r: CostRef): Cost {
  switch (r.kind) {
    case 'common':
      return d.common[r.i]!.cost;
    case 'leg':
      return d.scenarios[r.s]!.legs[r.i]!.cost;
    case 'stay':
      return d.scenarios[r.s]!.stays[r.i]![r.field];
    case 'extra':
      return d.extras[r.i]!.cost;
    case 'home':
      return d.settings.homeDaily;
  }
}

export function setCost(d: TripData, r: CostRef, c: Cost): void {
  switch (r.kind) {
    case 'common':
      d.common[r.i]!.cost = c;
      return;
    case 'leg':
      d.scenarios[r.s]!.legs[r.i]!.cost = c;
      return;
    case 'stay':
      d.scenarios[r.s]!.stays[r.i]![r.field] = c;
      return;
    case 'extra':
      d.extras[r.i]!.cost = c;
      return;
    case 'home':
      d.settings.homeDaily = c;
      return;
  }
}

const sameValue = (a: Cost, b: Cost) => a.eur === b.eur && a.cop === b.cop && a.status === b.status;

/** Agrupa los costos: un mismo tramo o el hotel de una ciudad en varios escenarios se editan juntos. */
export function priceGroups(d: TripData): PriceGroup[] {
  const name = (id: string) => d.places.find((p) => p.id === id)?.name ?? id;
  const map = new Map<string, PriceGroup>();
  const add = (key: string, base: Omit<PriceGroup, 'key' | 'refs' | 'scenarios' | 'mixed'>, ref: CostRef, scenario?: string) => {
    const g = map.get(key) ?? { key, ...base, refs: [], scenarios: [], mixed: false };
    if (g.refs.length && !sameValue(getCost(d, g.refs[0]!), getCost(d, ref))) g.mixed = true;
    g.refs.push(ref);
    if (scenario && !g.scenarios.includes(scenario)) g.scenarios.push(scenario);
    map.set(key, g);
  };

  d.common.forEach((c, i) => add(`common:${c.id}`, { section: 'comunes', label: c.label }, { kind: 'common', i }));
  d.scenarios.forEach((s, si) => {
    s.legs.forEach((l, i) => {
      const section: PriceSection = l.mode === 'vuelo' ? 'vuelos' : 'trenes';
      add(
        `leg:${l.from}|${l.to}|${l.mode}|${l.label ?? ''}`,
        { section, label: `${name(l.from)} → ${name(l.to)}`, ...(l.label ? { detail: l.label } : {}), per: '3 personas' },
        { kind: 'leg', s: si, i },
        s.id,
      );
    });
    s.stays.forEach((st, i) => {
      const place = name(st.placeId);
      add(`stay:${st.placeId}:lodging`, { section: 'hoteles', label: `Hotel en ${place}`, per: 'por noche' }, { kind: 'stay', s: si, i, field: 'lodgingPerNight' }, s.id);
      add(`stay:${st.placeId}:meals`, { section: 'comidas', label: `Comidas en ${place}`, per: 'por día' }, { kind: 'stay', s: si, i, field: 'mealsPerDay' }, s.id);
      add(`stay:${st.placeId}:local`, { section: 'local', label: `Transporte y entradas en ${place}`, per: 'por día' }, { kind: 'stay', s: si, i, field: 'localPerDay' }, s.id);
    });
  });
  d.extras.forEach((e, i) => add(`extra:${e.id}`, { section: 'extras', label: e.name, per: 'total' }, { kind: 'extra', i }));
  add('home', { section: 'casa', label: 'Gasto diario en Guadarrama/Madrid', per: 'por día' }, { kind: 'home' });

  const order: PriceSection[] = ['comunes', 'vuelos', 'trenes', 'hoteles', 'comidas', 'local', 'extras', 'casa'];
  return [...map.values()].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

/**
 * Nuevo valor escrito a mano.
 * - En COP: queda como monto fijo en pesos (lo cotizado en pesos no depende del euro).
 * - En EUR: si es un estimado con rango, el rango se mueve en la misma proporción.
 */
export function withValue(c: Cost, value: number, currency: 'EUR' | 'COP', rate: number): Cost {
  const next: Cost = { ...c };
  delete next.min;
  delete next.max;
  if (currency === 'COP') {
    next.cop = Math.round(value);
    next.eur = Math.round(value / rate);
    return next;
  }
  delete next.cop;
  next.eur = value;
  if (c.status === 'estimado' && c.cop === undefined && c.eur > 0) {
    const k = value / c.eur;
    if (c.min !== undefined) next.min = Math.round(c.min * k);
    if (c.max !== undefined) next.max = Math.round(c.max * k);
  }
  return next;
}

/** Cambia la moneda en que está expresado el costo, conservando su valor. */
export function withCurrency(c: Cost, currency: 'EUR' | 'COP', rate: number): Cost {
  if (currency === 'COP') return c.cop !== undefined ? c : withValue(c, Math.round(c.eur * rate), 'COP', rate);
  return c.cop === undefined ? c : withValue({ ...c, cop: undefined }, Math.round(c.cop / rate), 'EUR', rate);
}

/** Cambia el estado. Un precio cotizado o reservado es exacto y queda fechado. */
export function withStatus(c: Cost, status: CostStatus, today: string): Cost {
  const next: Cost = { ...c, status };
  if (status !== 'estimado') {
    delete next.min;
    delete next.max;
    next.checkedAt = c.status === status ? c.checkedAt ?? today : today;
  }
  return next;
}

/** Aplica una transformación a todos los costos del grupo. */
export function applyToGroup(d: TripData, g: PriceGroup, fn: (c: Cost) => Cost): void {
  for (const r of g.refs) setCost(d, r, fn(getCost(d, r)));
}
