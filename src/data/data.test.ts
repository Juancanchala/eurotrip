import { describe, expect, it } from 'vitest';
import { buildItinerary, compareScenarios, tripTotals, validateTrip } from '../engine';
import { CORRUPT_KEY, LocalStorageTripRepository, STORAGE_KEY, importTrip, seedData, type KeyValueStore } from './repository';
import { parseTrip } from './schema';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('seed', () => {
  const seed = seedData();

  it('pasa el esquema y no tiene errores de coherencia', () => {
    expect(parseTrip(seed).ok).toBe(true);
    const issues = validateTrip(seed);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues).toEqual([]); // tampoco avisos: los escenarios salen y vuelven a casa
  });

  it('todos los escenarios caben en los días del viaje', () => {
    for (const s of seed.scenarios) expect(tripTotals(seed, s).freeDays).toBeGreaterThan(0);
  });

  it('el itinerario de cada escenario cabe y coincide con los días usados', () => {
    for (const s of seed.scenarios) {
      const it = buildItinerary(seed, s);
      expect(it.overflowDays).toBe(0);
      expect(it.days.filter((d) => d.kind === 'ruta')).toHaveLength(tripTotals(seed, s).daysUsed);
      expect(it.days[0]!.date).toBe('2027-10-06');
    }
  });

  it('las rutas de referencia tienen solo 2 vuelos (salir y volver a Madrid), salvo C que tiene 1', () => {
    const flights = Object.fromEntries(seed.scenarios.map((s) => [s.id, s.legs.filter((l) => l.mode === 'vuelo').length]));
    expect(flights).toEqual({ A: 2, B: 2, C: 1 });
    expect(seed.scenarios.every((s) => s.kind === 'abierto')).toBe(true);
  });

  it('produce una comparación con los tres escenarios', () => {
    expect(compareScenarios(seed).rows).toHaveLength(3);
  });
});

describe('repository localStorage', () => {
  it('sin datos devuelve el seed', async () => {
    const repo = new LocalStorageTripRepository(memoryStore());
    expect((await repo.load()).scenarios).toHaveLength(3);
  });

  it('guarda y vuelve a cargar', async () => {
    const store = memoryStore();
    const repo = new LocalStorageTripRepository(store);
    const d = seedData();
    d.settings.budgetEUR = 12345;
    await repo.save(d);
    expect((await repo.load()).settings.budgetEUR).toBe(12345);
  });

  it('no guarda datos inválidos', async () => {
    const repo = new LocalStorageTripRepository(memoryStore());
    const d = seedData();
    d.settings.totalDays = -3;
    await expect(repo.save(d)).rejects.toThrow();
  });

  it('si lo guardado está dañado usa el seed y conserva una copia', async () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, '{"roto":');
    const repo = new LocalStorageTripRepository(store);
    expect((await repo.load()).version).toBe(1);
    expect(store.map.get(CORRUPT_KEY)).toBe('{"roto":');
  });

  it('funciona sin almacenamiento (modo privado)', async () => {
    const repo = new LocalStorageTripRepository(null);
    await repo.save(seedData());
    expect((await repo.load()).version).toBe(1);
  });

  it('importa solo respaldos válidos', () => {
    expect(importTrip('no json').ok).toBe(false);
    expect(importTrip(JSON.stringify(seedData())).ok).toBe(true);
  });
});
