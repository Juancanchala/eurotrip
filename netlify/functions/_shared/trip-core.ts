/**
 * Datos compartidos del viaje: una sola versión para toda la familia,
 * con control de cambios simultáneos e historial para restaurar.
 */
import { z } from 'zod';
import { parseTrip } from '../../../src/data/schema';
import type { TripData } from '../../../src/engine/types';

export interface TripDoc {
  revision: number;
  updatedAt: string;
  updatedBy?: string;
  data: TripData;
}

export interface VersionInfo {
  revision: number;
  updatedAt: string;
  updatedBy?: string;
}

/** Almacenamiento mínimo que necesitamos (Netlify Blobs en producción, memoria en pruebas). */
export interface DocStore {
  getDoc(): Promise<{ doc: TripDoc; etag: string } | null>;
  /** Escribe solo si nadie escribió desde `etag` (null = solo si no existe). Devuelve false si perdió la carrera. */
  putDoc(doc: TripDoc, etag: string | null): Promise<boolean>;
  putSnapshot(doc: TripDoc): Promise<void>;
  listSnapshots(): Promise<VersionInfo[]>;
  getSnapshot(revision: number): Promise<TripDoc | null>;
  deleteSnapshot(revision: number): Promise<void>;
}

export const MAX_TRIP_BYTES = 300_000;
export const KEEP_SNAPSHOTS = 60;

const PutSchema = z.object({
  baseRevision: z.number().int().min(0),
  author: z.string().trim().max(40).optional(),
  data: z.unknown(),
});

type Result = { status: number; body: unknown };

export async function getTrip(store: DocStore, params: URLSearchParams): Promise<Result> {
  if (params.has('versions')) {
    const list = await store.listSnapshots();
    return { status: 200, body: { versions: list.sort((a, b) => b.revision - a.revision).slice(0, 30) } };
  }
  const rev = params.get('revision');
  if (rev !== null) {
    const n = Number(rev);
    if (!Number.isInteger(n) || n < 1) return { status: 400, body: { error: 'Versión inválida' } };
    const snap = await store.getSnapshot(n);
    return snap ? { status: 200, body: snap } : { status: 404, body: { error: 'Esa versión ya no existe' } };
  }
  const cur = await store.getDoc();
  // Vacío: aún nadie ha guardado. El primer dispositivo sube sus datos.
  if (!cur) return { status: 200, body: { revision: 0, data: null } };
  return { status: 200, body: cur.doc };
}

export async function putTrip(store: DocStore, body: unknown, now = new Date()): Promise<Result> {
  const p = PutSchema.safeParse(body);
  if (!p.success) return { status: 400, body: { error: 'Solicitud inválida' } };
  const t = parseTrip(p.data.data);
  if (!t.ok) return { status: 400, body: { error: `Datos inválidos: ${t.errors[0]}` } };

  const cur = await store.getDoc();
  const curRev = cur?.doc.revision ?? 0;
  // Alguien guardó primero: se devuelve lo vigente para que el cliente lo cargue.
  if (p.data.baseRevision !== curRev) {
    return { status: 409, body: { error: 'Los datos cambiaron en otro dispositivo', current: cur?.doc ?? null } };
  }

  const doc: TripDoc = {
    revision: curRev + 1,
    updatedAt: now.toISOString(),
    ...(p.data.author ? { updatedBy: p.data.author } : {}),
    data: t.data,
  };
  const ok = await store.putDoc(doc, cur?.etag ?? null);
  if (!ok) {
    const latest = await store.getDoc();
    return { status: 409, body: { error: 'Los datos cambiaron en otro dispositivo', current: latest?.doc ?? null } };
  }

  // Historial: si falla, el guardado principal ya quedó; no se bloquea al usuario.
  try {
    await store.putSnapshot(doc);
    const all = await store.listSnapshots();
    const old = all.sort((a, b) => b.revision - a.revision).slice(KEEP_SNAPSHOTS);
    await Promise.all(old.map((v) => store.deleteSnapshot(v.revision)));
  } catch (e) {
    console.error('trip: no se pudo guardar el historial', e instanceof Error ? e.message : e);
  }
  return { status: 200, body: { revision: doc.revision, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy } };
}

/** Almacenamiento en memoria, para pruebas. */
export class MemoryDocStore implements DocStore {
  doc: { doc: TripDoc; etag: string } | null = null;
  snaps = new Map<number, TripDoc>();
  private n = 0;
  async getDoc() {
    return this.doc ? structuredClone(this.doc) : null;
  }
  async putDoc(doc: TripDoc, etag: string | null) {
    if ((this.doc?.etag ?? null) !== etag) return false;
    this.doc = { doc: structuredClone(doc), etag: `e${++this.n}` };
    return true;
  }
  async putSnapshot(doc: TripDoc) {
    this.snaps.set(doc.revision, structuredClone(doc));
  }
  async listSnapshots() {
    return [...this.snaps.values()].map(({ revision, updatedAt, updatedBy }) => ({ revision, updatedAt, ...(updatedBy ? { updatedBy } : {}) }));
  }
  async getSnapshot(r: number) {
    return this.snaps.get(r) ?? null;
  }
  async deleteSnapshot(r: number) {
    this.snaps.delete(r);
  }
}
