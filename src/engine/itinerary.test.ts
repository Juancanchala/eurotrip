import { describe, expect, it } from 'vitest';
import { fixture } from './fixture';
import { buildItinerary, daysUsed, findScenario, scenarioAlerts } from './index';

const data = fixture();
const A = findScenario(data, 'A');
const B = findScenario(data, 'B');

describe('itinerario con fechas', () => {
  it('ruta abierta: fecha de cada tramo y de cada noche', () => {
    const it = buildItinerary(data, A);
    expect(it.days).toHaveLength(20);
    expect(it.days[0]!.kind).toBe('transatlantico');
    expect(it.days[0]!.date).toBe('2027-10-06');
    expect(it.days[19]!.kind).toBe('transatlantico');
    // Llega el 7 oct, descansa 2 días y sale el 9 oct.
    expect(it.days[1]!.kind).toBe('casa');
    expect(it.days[3]!.legs.map((l) => l.id)).toEqual(['a1']);
    expect(it.days[3]!.sleepAt).toBe('chu');
    expect(it.days[4]!.sleepAt).toBe('chu');
    expect(it.days[5]!.legs.map((l) => l.id)).toEqual(['a2']);
    expect(it.days[8]!.legs.map((l) => l.id)).toEqual(['a3']); // tras 3 noches en París
    expect(it.days[8]!.sleepAt).toBe('mad');
    expect(it.trips).toEqual([{ trip: 1, from: '2027-10-09', to: '2027-10-14' }]);
    expect(it.overflowDays).toBe(0);
  });

  it('los días de ruta coinciden con los días usados del motor', () => {
    for (const s of [A, B]) {
      expect(buildItinerary(data, s).days.filter((d) => d.kind === 'ruta')).toHaveLength(daysUsed(s, data.settings));
    }
  });

  it('ida y vuelta: dos salidas separadas por días en casa', () => {
    const it = buildItinerary(data, B);
    expect(it.trips).toHaveLength(2);
    expect(it.trips[0]!.to).toBe('2027-10-11');
    expect(it.trips[1]!.from).toBe('2027-10-14');
  });

  it('detecta cuando el plan no cabe', () => {
    const d = fixture();
    d.settings.totalDays = 9;
    expect(buildItinerary(d, findScenario(d, 'A')).overflowDays).toBe(1);
  });

  it('aplica alertas por lugar y por nombre de tramo', () => {
    const it = buildItinerary(data, A);
    expect(it.days[5]!.alerts.map((a) => a.id).sort()).toEqual(['par-oct', 'tren']);
    const all = scenarioAlerts(it);
    expect(all.find((a) => a.alert.id === 'par-oct')!.dates).toEqual(['2027-10-11', '2027-10-12', '2027-10-13', '2027-10-14']);
  });

  it('una alerta fuera de las fechas no aplica', () => {
    const d = fixture();
    d.alerts = [{ id: 'x', from: '2027-12-01', to: '2027-12-31', placeIds: [], level: 'info', message: '' }];
    expect(scenarioAlerts(buildItinerary(d, findScenario(d, 'A')))).toEqual([]);
  });
});
