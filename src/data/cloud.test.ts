import { describe, expect, it } from 'vitest';
import { MemoryDocStore, getTrip, putTrip } from '../../netlify/functions/_shared/trip-core';
import { CloudTripRepository, ConflictError, type SyncState } from './cloud';
import { LocalStorageTripRepository, seedData, type KeyValueStore } from './repository';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/** Servidor falso que usa el mismo núcleo que la función de Netlify. */
function server(store = new MemoryDocStore()) {
  let online = true;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!online) throw new TypeError('Failed to fetch');
    const url = new URL(String(input), 'https://app.test');
    const r = init?.method === 'PUT' ? await putTrip(store, JSON.parse(String(init.body))) : await getTrip(store, url.searchParams);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { store, fetchImpl, setOnline: (v: boolean) => (online = v) };
}

const device = (fetchImpl: typeof fetch) => new CloudTripRepository(new LocalStorageTripRepository(memoryStore()), '/api/trip', fetchImpl);

describe('datos compartidos entre dispositivos', () => {
  it('el primer dispositivo sube sus datos (incluidos cambios locales previos)', async () => {
    const srv = server();
    const local = new LocalStorageTripRepository(memoryStore());
    const mine = seedData();
    mine.settings.budgetEUR = 12000;
    await local.save(mine);
    const repo = new CloudTripRepository(local, '/api/trip', srv.fetchImpl);
    const d = await repo.load();
    expect(d.settings.budgetEUR).toBe(12000);
    expect(srv.store.doc?.doc.revision).toBe(1);
    expect(srv.store.doc?.doc.data.settings.budgetEUR).toBe(12000);
  });

  it('lo que guarda uno lo ve el otro al refrescar', async () => {
    const srv = server();
    const a = device(srv.fetchImpl);
    const b = device(srv.fetchImpl);
    const da = await a.load();
    const db = await b.load();
    da.settings.totalDays = 19;
    await a.save(da);
    const r = await b.refresh(db);
    expect(r?.data.settings.totalDays).toBe(19);
    // Sin cambios nuevos, refrescar no devuelve nada.
    expect(await b.refresh(r!.data)).toBeNull();
  });

  it('un cambio sobre una versión vieja no pisa el de otro: conflicto con la versión vigente', async () => {
    const srv = server();
    const a = device(srv.fetchImpl);
    const b = device(srv.fetchImpl);
    const da = await a.load();
    const db = await b.load();
    da.settings.budgetEUR = 10000;
    await a.save(da);
    db.settings.budgetEUR = 7000;
    const err = await b.save(db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).remote?.data.settings.budgetEUR).toBe(10000);
    expect(srv.store.doc?.doc.data.settings.budgetEUR).toBe(10000);
    // Tras el conflicto, b queda al día y puede volver a guardar.
    const fresh = (err as ConflictError).remote!.data;
    fresh.settings.budgetEUR = 7000;
    await b.save(fresh);
    expect(srv.store.doc?.doc.data.settings.budgetEUR).toBe(7000);
  });

  it('sin conexión guarda en el dispositivo y sube al volver', async () => {
    const srv = server();
    const a = device(srv.fetchImpl);
    const states: SyncState['status'][] = [];
    a.subscribe((s) => states.push(s.status));
    const d = await a.load();
    srv.setOnline(false);
    d.settings.fixedDays = 3;
    await a.save(d); // no lanza
    expect(states.at(-1)).toBe('sin_conexion');
    expect(srv.store.doc?.doc.data.settings.fixedDays).toBe(2);
    srv.setOnline(true);
    expect(await a.refresh(d)).toBeNull();
    expect(srv.store.doc?.doc.data.settings.fixedDays).toBe(3);
    expect(states.at(-1)).toBe('sincronizado');
  });

  it('sin servicio (404) trabaja en modo local', async () => {
    const fetchImpl = (async () => new Response('Not found', { status: 404 })) as unknown as typeof fetch;
    const repo = device(fetchImpl);
    let last: SyncState | undefined;
    repo.subscribe((s) => (last = s));
    const d = await repo.load();
    expect(d.version).toBe(1);
    expect(last?.status).toBe('solo_local');
    await repo.save(d); // no intenta subir
    expect(await repo.refresh(d)).toBeNull();
  });

  it('historial y restauración', async () => {
    const srv = server();
    const a = device(srv.fetchImpl);
    const d = await a.load(); // v1
    d.settings.budgetEUR = 5555;
    await a.save(d); // v2
    const versions = await a.versions();
    expect(versions.map((v) => v.revision)).toEqual([2, 1]);
    expect((await a.version(1)).settings.budgetEUR).toBe(9000);
  });
});
