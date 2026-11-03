import { describe, expect, it } from 'vitest';
import { tripTotals, validateTrip } from '../engine';
import type { TripData } from '../engine/types';
import { CURRENT_SEED_REVISION, migrateTrip } from './migrations';
import { seedData } from './repository';
import { parseTrip } from './schema';

/** Datos como los tenía la familia antes del cambio de rutas (revisión 1, con sus costos editados). */
function oldFamilyData(): TripData {
  const d = seedData();
  d.seedRevision = 1;
  d.scenarios = [
    {
      id: 'A',
      name: 'Vieja A',
      kind: 'abierto',
      summary: '',
      legs: [
        { id: 'x1', from: 'madrid', to: 'zurich', mode: 'vuelo', hours: 5, cost: { eur: 330, status: 'estimado' } },
        { id: 'x2', from: 'zurich', to: 'paris', mode: 'tren', hours: 5, cost: { eur: 999, status: 'estimado' } },
        { id: 'x3', from: 'paris', to: 'madrid', mode: 'vuelo', hours: 5, cost: { eur: 450, cop: 2_100_000, status: 'cotizado', checkedAt: '2026-11-03' } },
      ],
      stays: [{ placeId: 'paris', nights: 3, lodgingPerNight: { eur: 210, status: 'cotizado', checkedAt: '2026-11-03' }, mealsPerDay: { eur: 120, status: 'estimado' }, localPerDay: { eur: 60, status: 'estimado' } }],
    },
  ];
  d.common[0]!.cost = { eur: 1402, cop: 6_500_000, status: 'cotizado' };
  d.settings.selectedScenarioId = 'A';
  d.assumptions = ['Supuesto escrito por la familia'];
  d.alerts = d.alerts.filter((a) => a.id !== 'toussaint');
  return d;
}

describe('migración a las rutas reales', () => {
  it('reemplaza las rutas y conserva lo que la familia fijó', () => {
    const { data, changed } = migrateTrip(oldFamilyData(), seedData());
    expect(changed).toBe(true);
    expect(data.seedRevision).toBe(CURRENT_SEED_REVISION);
    expect(data.scenarios.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    // Costos comunes intactos.
    expect(data.common[0]!.cost.cop).toBe(6_500_000);
    // Vuelo París → Madrid cotizado en pesos se reutiliza en B, que lo tiene.
    const b6 = data.scenarios.find((s) => s.id === 'B')!.legs.find((l) => l.from === 'paris' && l.to === 'madrid')!;
    expect(b6.cost).toMatchObject({ cop: 2_100_000, status: 'cotizado' });
    // Hotel en París cotizado se reutiliza en los tres escenarios.
    for (const s of data.scenarios) expect(s.stays.find((st) => st.placeId === 'paris')!.lodgingPerNight.eur).toBe(210);
    // Un estimado viejo no pisa el nuevo de referencia.
    expect(data.scenarios[0]!.legs.some((l) => l.cost.eur === 999)).toBe(false);
    // Supuestos de la familia se conservan y se agrega el de rutas; alertas que faltaban se agregan.
    expect(data.assumptions).toContain('Supuesto escrito por la familia');
    expect(data.assumptions.some((a) => a.startsWith('Rutas abiertas'))).toBe(true);
    expect(data.alerts.some((a) => a.id === 'toussaint')).toBe(true);
  });

  it('el resultado es válido y coherente', () => {
    const { data } = migrateTrip(oldFamilyData(), seedData());
    expect(parseTrip(data).ok).toBe(true);
    expect(validateTrip(data).filter((i) => i.level === 'error')).toEqual([]);
    for (const s of data.scenarios) expect(tripTotals(data, s).freeDays).toBeGreaterThan(0);
  });

  it('no hace nada si ya está al día', () => {
    const d = seedData();
    const m = migrateTrip(d, seedData());
    expect(m.changed).toBe(false);
    expect(m.data).toBe(d);
  });

  it('datos guardados sin la marca se leen como revisión 1', () => {
    const raw = JSON.parse(JSON.stringify(seedData())) as Record<string, unknown>;
    delete raw.seedRevision;
    const p = parseTrip(raw);
    expect(p.ok && p.data.seedRevision).toBe(1);
  });
});

describe('alertas en la migración', () => {
  it('corrige la alerta de obras Turín–París para que no se active con otros TGV', () => {
    const old = oldFamilyData();
    const i = old.alerts.findIndex((a) => a.id === 'frejus');
    old.alerts[i] = { ...old.alerts[i]!, placeIds: ['torino', 'paris'] };
    old.alerts.push({ id: 'mia', from: '2027-10-01', to: '2027-10-02', placeIds: [], level: 'info', message: 'Alerta de la familia' });
    const { data } = migrateTrip(old, seedData());
    expect(data.alerts.find((a) => a.id === 'frejus')!.placeIds).toEqual(['torino']);
    expect(data.alerts.some((a) => a.id === 'mia')).toBe(true);
  });
});
