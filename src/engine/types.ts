/**
 * Modelo de datos del viaje. TypeScript puro, sin dependencias.
 * Todas las cifras de dinero están en EUR y son el total para toda la familia,
 * salvo que el nombre del campo diga lo contrario.
 */

/** Qué tan firme es una cifra. */
export type CostStatus = 'estimado' | 'cotizado' | 'reservado';

/** Un costo con su rango de incertidumbre y su procedencia. */
export interface Cost {
  /** Valor central en EUR (total familia). */
  eur: number;
  /**
   * Monto fijo en COP (p. ej., tiquete pagado en pesos). Si existe, manda sobre `eur`:
   * su valor en EUR se calcula con la tasa vigente y no le afecta la variación del euro.
   */
  cop?: number;
  /** Escenario optimista. Si falta, se usa `eur`. */
  min?: number;
  /** Escenario pesimista. Si falta, se usa `eur`. */
  max?: number;
  status: CostStatus;
  /** URL de la fuente. */
  source?: string;
  /** Fecha de consulta (AAAA-MM-DD). */
  checkedAt?: string;
  note?: string;
}

export type Mode = 'tren' | 'vuelo' | 'bus' | 'auto';

export interface Place {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  note?: string;
}

export interface Leg {
  id: string;
  from: string; // Place.id
  to: string; // Place.id
  mode: Mode;
  /** Horas de puerta a puerta (incluye aeropuertos y conexiones). */
  hours: number;
  cost: Cost;
  label?: string;
  note?: string;
  /** Riesgo conocido del tramo (obras, cierres, conexiones justas). */
  risk?: string;
}

export interface Stay {
  placeId: string;
  nights: number;
  lodgingPerNight: Cost;
  /** Comidas de la familia por día. */
  mealsPerDay: Cost;
  /** Transporte local, entradas y actividades por día. */
  localPerDay: Cost;
  note?: string;
}

export type ScenarioKind = 'abierto' | 'ida_vuelta';

export interface Scenario {
  id: string;
  name: string;
  kind: ScenarioKind;
  summary: string;
  legs: Leg[];
  stays: Stay[];
}

/** Costos que no dependen del escenario (vuelo transatlántico, seguro…). */
export interface CommonCost {
  id: string;
  label: string;
  cost: Cost;
}

export interface Extra {
  id: string;
  name: string;
  placeId: string;
  /** Días mínimos que pide el extra (incluye traslados). */
  minDays: number;
  /** Costo total del extra para la familia (transporte, hospedaje, comidas, entradas). */
  cost: Cost;
  summary: string;
}

export interface Travelers {
  adults: number;
  children: number;
  childAges: number[];
  /** Cómo nombrar a los menores en la UI, p. ej. "1 niña". */
  childrenLabel?: string;
}

export interface Settings {
  /** Fecha de salida desde Colombia (AAAA-MM-DD). */
  startDate: string;
  /** Días totales del viaje, de puerta a puerta. */
  totalDays: number;
  /** Días que se van en el vuelo transatlántico y la llegada (no disponibles). */
  fixedDays: number;
  budgetEUR: number;
  /** true mientras el presupuesto objetivo sea provisional. */
  budgetDraft: boolean;
  /** Tasa base EUR→COP (de /fx o manual). */
  baseRate: number;
  /** Colchón sobre la tasa, en %. */
  cushionPct: number;
  /**
   * Ajuste de precios estimados (consultados hoy) a la fecha del viaje, en %.
   * Cubre la inflación; la temporada ya va en cada referencia. No se aplica a costos cotizados o reservados.
   */
  priceAdjustPct: number;
  /** Lugares que cuentan como "casa" (Madrid, Guadarrama). */
  hubPlaceIds: string[];
  /** Gasto diario de la familia en los días en casa. */
  homeDaily: Cost;
  travelers: Travelers;
  selectedScenarioId: string;
  itinerary: {
    /** Días en casa después de llegar, antes de la primera salida. */
    restDaysOnArrival: number;
    /** Días en casa entre una salida y la siguiente. */
    gapDaysBetweenTrips: number;
  };
}

/** Alerta de calendario: temporadas, festivos, obras. Son datos, no código. */
export interface CalendarAlert {
  id: string;
  /** AAAA-MM-DD, inclusive. */
  from: string;
  to: string;
  /** Lugares donde aplica. Vacío = en todos. */
  placeIds: string[];
  /** Si se define, solo aplica a tramos cuyo nombre contiene este texto. */
  labelIncludes?: string;
  level: 'info' | 'aviso';
  message: string;
  source?: string;
}

export interface TripData {
  version: 1;
  /** Versión de las rutas de referencia con que se crearon (ver src/data/migrations.ts). */
  seedRevision: number;
  settings: Settings;
  places: Place[];
  scenarios: Scenario[];
  common: CommonCost[];
  extras: Extra[];
  alerts: CalendarAlert[];
  /** Supuestos explícitos, visibles en la UI y enviados al asistente. */
  assumptions: string[];
}

/** Un valor con su banda optimista/pesimista. */
export interface Range {
  eur: number;
  min: number;
  max: number;
}
