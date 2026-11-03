import { describe, expect, it } from 'vitest';
import { seedData } from '../../../src/data/repository';
import { KEEP_SNAPSHOTS, MemoryDocStore, getTrip, putTrip, type TripDoc } from './trip-core';

const q = (s = '') => new URLSearchParams(s);

describe('datos compartidos', () => {
  it('vacío al inicio', async () => {
    const store = new MemoryDocStore();
    expect((await getTrip(store, q())).body).toEqual({ revision: 0, data: null });
  });

  it('guarda, sube la versión y registra quién', async () => {
    const store = new MemoryDocStore();
    const r = await putTrip(store, { baseRevision: 0, author: 'Juan', data: seedData() }, new Date('2026-11-03T10:00:00Z'));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revision: 1, updatedBy: 'Juan', updatedAt: '2026-11-03T10:00:00.000Z' });
    const g = (await getTrip(store, q())).body as TripDoc;
    expect(g.revision).toBe(1);
    expect(g.data.scenarios).toHaveLength(3);
  });

  it('no deja que un cambio viejo pise uno nuevo', async () => {
    const store = new MemoryDocStore();
    await putTrip(store, { baseRevision: 0, data: seedData() });
    const d2 = seedData();
    d2.settings.budgetEUR = 11111;
    await putTrip(store, { baseRevision: 1, author: 'Ana', data: d2 }); // revisión 2
    // Otro dispositivo aún estaba en la 1.
    const stale = seedData();
    stale.settings.budgetEUR = 22222;
    const r = await putTrip(store, { baseRevision: 1, data: stale });
    expect(r.status).toBe(409);
    expect((r.body as { current: TripDoc }).current.data.settings.budgetEUR).toBe(11111);
    expect(((await getTrip(store, q())).body as TripDoc).data.settings.budgetEUR).toBe(11111);
  });

  it('si otro escribe justo entre la lectura y la escritura, también es conflicto', async () => {
    const store = new MemoryDocStore();
    await putTrip(store, { baseRevision: 0, data: seedData() });
    const realPut = store.putDoc.bind(store);
    store.putDoc = async (doc, etag) => {
      store.doc = { doc: { ...doc, revision: 99 }, etag: 'otro' }; // carrera ganada por otro
      return realPut(doc, etag);
    };
    expect((await putTrip(store, { baseRevision: 1, data: seedData() })).status).toBe(409);
  });

  it('rechaza datos inválidos sin tocar lo guardado', async () => {
    const store = new MemoryDocStore();
    await putTrip(store, { baseRevision: 0, data: seedData() });
    expect((await putTrip(store, { baseRevision: 1, data: { version: 1 } })).status).toBe(400);
    expect((await putTrip(store, { data: seedData() })).status).toBe(400);
    expect(((await getTrip(store, q())).body as TripDoc).revision).toBe(1);
  });

  it('historial: lista versiones, permite leer una y conserva solo las últimas', async () => {
    const store = new MemoryDocStore();
    for (let i = 0; i < KEEP_SNAPSHOTS + 5; i++) {
      const d = seedData();
      d.settings.budgetEUR = 1000 + i;
      expect((await putTrip(store, { baseRevision: i, author: 'Juan', data: d })).status).toBe(200);
    }
    const { versions } = (await getTrip(store, q('versions=1'))).body as { versions: { revision: number }[] };
    expect(versions[0]!.revision).toBe(KEEP_SNAPSHOTS + 5);
    expect(versions.length).toBeLessThanOrEqual(30);
    expect(store.snaps.size).toBe(KEEP_SNAPSHOTS);
    const old = (await getTrip(store, q('revision=10'))).body as TripDoc;
    expect(old.data.settings.budgetEUR).toBe(1009);
    expect((await getTrip(store, q('revision=1'))).status).toBe(404); // ya se depuró
    expect((await getTrip(store, q('revision=abc'))).status).toBe(400);
  });
});
