import type { Cost, TripData } from './types';

/** Costo exacto (sin rango) para pruebas con aritmética simple. */
export const c = (eur: number, min?: number, max?: number, status: Cost['status'] = 'estimado'): Cost => ({
  eur,
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
  status,
});

/** Viaje mínimo con números redondos para verificar fórmulas a mano. */
export function fixture(): TripData {
  return {
    version: 1,
    seedRevision: 2,
    settings: {
      startDate: '2027-10-06',
      totalDays: 20,
      fixedDays: 2,
      budgetEUR: 5000,
      budgetDraft: false,
      baseRate: 4000,
      cushionPct: 5,
      priceAdjustPct: 0,
      hubPlaceIds: ['mad'],
      homeDaily: c(50, 40, 60),
      travelers: { adults: 2, children: 1, childAges: [8] },
      selectedScenarioId: 'A',
      itinerary: { restDaysOnArrival: 2, gapDaysBetweenTrips: 2 },
    },
    places: [
      { id: 'mad', name: 'Madrid', country: 'ES', lat: 40, lng: -3 },
      { id: 'par', name: 'París', country: 'FR', lat: 48, lng: 2 },
      { id: 'chu', name: 'Chur', country: 'CH', lat: 46, lng: 9 },
      { id: 'tol', name: 'Toledo', country: 'ES', lat: 39, lng: -4 },
    ],
    scenarios: [
      {
        // Abierto: Madrid → Chur → París → Madrid. 2 + 3 noches.
        id: 'A',
        name: 'Abierto',
        kind: 'abierto',
        summary: '',
        legs: [
          { id: 'a1', from: 'mad', to: 'chu', mode: 'vuelo', hours: 5, cost: c(300, 200, 400) },
          { id: 'a2', from: 'chu', to: 'par', mode: 'tren', hours: 7, cost: c(200, 150, 300, 'cotizado'), label: 'Bernina y TGV' },
          { id: 'a3', from: 'par', to: 'mad', mode: 'vuelo', hours: 5, cost: c(250) },
        ],
        stays: [
          { placeId: 'chu', nights: 2, lodgingPerNight: c(200), mealsPerDay: c(100), localPerDay: c(20) },
          { placeId: 'par', nights: 3, lodgingPerNight: c(250, 200, 300, 'reservado'), mealsPerDay: c(120), localPerDay: c(50) },
        ],
      },
      {
        // Ida y vuelta: dos salidas, 2 + 2 noches.
        id: 'B',
        name: 'Ida y vuelta',
        kind: 'ida_vuelta',
        summary: '',
        legs: [
          { id: 'b1', from: 'mad', to: 'chu', mode: 'vuelo', hours: 5, cost: c(300) },
          { id: 'b2', from: 'chu', to: 'mad', mode: 'vuelo', hours: 5, cost: c(300) },
          { id: 'b3', from: 'mad', to: 'par', mode: 'vuelo', hours: 4, cost: c(250) },
          { id: 'b4', from: 'par', to: 'mad', mode: 'vuelo', hours: 4, cost: c(250) },
        ],
        stays: [
          { placeId: 'chu', nights: 2, lodgingPerNight: c(200), mealsPerDay: c(100), localPerDay: c(20) },
          { placeId: 'par', nights: 2, lodgingPerNight: c(250), mealsPerDay: c(120), localPerDay: c(50) },
        ],
      },
    ],
    common: [{ id: 'atl', label: 'Transatlántico', cost: c(2000, 1800, 2400) }],
    extras: [
      { id: 'tol', name: 'Toledo', placeId: 'tol', minDays: 1, cost: c(150, 100, 200), summary: '' },
      { id: 'big', name: 'Grande', placeId: 'tol', minDays: 20, cost: c(100), summary: '' },
    ],
    alerts: [
      { id: 'par-oct', from: '2027-10-01', to: '2027-10-31', placeIds: ['par'], level: 'info', message: 'París en octubre' },
      { id: 'tren', from: '2027-10-01', to: '2027-10-31', placeIds: [], labelIncludes: 'bernina', level: 'aviso', message: 'Bernina' },
    ],
    assumptions: [],
  };
}
