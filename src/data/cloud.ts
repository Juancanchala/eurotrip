import type { TripData } from '../engine/types';
import { getAccessKey } from '../lib/agent';
import { LocalStorageTripRepository, type TripRepository } from './repository';
import { parseTrip } from './schema';

export type SyncStatus = 'cargando' | 'sincronizado' | 'guardando' | 'sin_conexion' | 'solo_local' | 'error';

export interface SyncState {
  status: SyncStatus;
  revision: number;
  updatedAt?: string;
  updatedBy?: string;
  message?: string;
}

export interface RemoteDoc {
  revision: number;
  updatedAt?: string;
  updatedBy?: string;
  data: TripData | null;
}

export interface VersionInfo {
  revision: number;
  updatedAt: string;
  updatedBy?: string;
}

/** Otro dispositivo guardó antes: se entrega la versión vigente. */
export class ConflictError extends Error {
  constructor(readonly remote: { data: TripData; revision: number; updatedBy?: string } | null) {
    super('Los datos cambiaron en otro dispositivo');
  }
}

const AUTHOR_KEY = 'eurotrip:author';
export function getAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setAuthor(name: string) {
  try {
    if (name.trim()) localStorage.setItem(AUTHOR_KEY, name.trim().slice(0, 40));
    else localStorage.removeItem(AUTHOR_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Datos compartidos por toda la familia (Netlify Blobs vía /api/trip),
 * con copia local para trabajar sin conexión y como respaldo.
 */
export class CloudTripRepository implements TripRepository {
  private state: SyncState = { status: 'cargando', revision: 0 };
  private listeners = new Set<(s: SyncState) => void>();
  /** Hay cambios locales aún no subidos. */
  private pending = false;

  constructor(
    private readonly local = new LocalStorageTripRepository(),
    private readonly url = '/api/trip',
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  subscribe(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => void this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    if (!('message' in patch)) delete this.state.message;
    for (const l of this.listeners) l(this.state);
  }

  private headers(json = false): HeadersInit {
    return { ...(json ? { 'content-type': 'application/json' } : {}), 'x-app-key': getAccessKey() };
  }

  /** null = no hay servicio (sin conexión o sin funciones en local). */
  private async fetchDoc(): Promise<{ ok: true; doc: RemoteDoc } | { ok: false; status: SyncStatus; message: string }> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, { headers: this.headers(), cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    } catch {
      return { ok: false, status: 'sin_conexion', message: 'Sin conexión: los cambios quedan en este dispositivo y se suben al volver.' };
    }
    if (res.status === 404) return { ok: false, status: 'solo_local', message: 'Modo local: aquí no hay servicio compartido.' };
    if (res.status === 401) return { ok: false, status: 'error', message: 'Se necesita la clave de acceso de la familia.' };
    if (!res.ok) return { ok: false, status: 'error', message: 'No se pudo leer los datos compartidos.' };
    const body = (await res.json()) as RemoteDoc;
    if (body.data) {
      const p = parseTrip(body.data);
      if (!p.ok) return { ok: false, status: 'error', message: 'Los datos compartidos no son válidos.' };
      body.data = p.data;
    }
    return { ok: true, doc: body };
  }

  async load(): Promise<TripData> {
    const r = await this.fetchDoc();
    if (!r.ok) {
      this.set({ status: r.status, message: r.message });
      if (r.status === 'sin_conexion') this.pending = true;
      return this.local.load();
    }
    if (!r.doc.data) {
      // Nadie ha guardado aún: los datos de este dispositivo pasan a ser los de todos.
      const mine = await this.local.load();
      await this.push(mine).catch(() => undefined);
      return mine;
    }
    await this.local.save(r.doc.data).catch(() => undefined);
    this.set({ status: 'sincronizado', revision: r.doc.revision, updatedAt: r.doc.updatedAt, updatedBy: r.doc.updatedBy });
    return r.doc.data;
  }

  async save(data: TripData): Promise<void> {
    await this.local.save(data);
    if (this.state.status === 'solo_local') return;
    this.pending = true;
    await this.push(data);
  }

  private async push(data: TripData): Promise<void> {
    this.set({ status: 'guardando' });
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: 'PUT',
        headers: this.headers(true),
        body: JSON.stringify({ baseRevision: this.state.revision, author: getAuthor() || undefined, data }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      this.pending = true;
      this.set({ status: 'sin_conexion', message: 'Sin conexión: el cambio quedó en este dispositivo y se sube al volver.' });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      revision?: number;
      updatedAt?: string;
      updatedBy?: string;
      error?: string;
      current?: RemoteDoc | null;
    };
    if (res.status === 409) {
      this.pending = false;
      const cur = body.current;
      const parsed = cur?.data ? parseTrip(cur.data) : null;
      if (cur && parsed?.ok) {
        await this.local.save(parsed.data).catch(() => undefined);
        this.set({ status: 'sincronizado', revision: cur.revision, updatedAt: cur.updatedAt, updatedBy: cur.updatedBy });
        throw new ConflictError({ data: parsed.data, revision: cur.revision, updatedBy: cur.updatedBy });
      }
      this.set({ status: 'error', message: 'Conflicto al guardar.' });
      throw new ConflictError(null);
    }
    if (res.status === 404) {
      this.set({ status: 'solo_local', message: 'Modo local: aquí no hay servicio compartido.' });
      return;
    }
    if (!res.ok) {
      this.set({ status: 'error', message: body.error ?? 'No se pudo guardar para todos.' });
      throw new Error(body.error ?? 'No se pudo guardar para todos');
    }
    this.pending = false;
    this.set({ status: 'sincronizado', revision: body.revision ?? this.state.revision + 1, updatedAt: body.updatedAt, updatedBy: body.updatedBy });
  }

  /**
   * Busca cambios de otros dispositivos. Devuelve los datos nuevos, o null si no hay.
   * Si este dispositivo tenía cambios sin subir y nadie más cambió nada, los sube.
   */
  async refresh(current: TripData): Promise<{ data: TripData; updatedBy?: string } | null> {
    if (this.state.status === 'solo_local') return null;
    const r = await this.fetchDoc();
    if (!r.ok) {
      this.set({ status: r.status, message: r.message });
      return null;
    }
    const doc = r.doc;
    if (doc.data && doc.revision > this.state.revision) {
      this.pending = false;
      await this.local.save(doc.data).catch(() => undefined);
      this.set({ status: 'sincronizado', revision: doc.revision, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
      return { data: doc.data, updatedBy: doc.updatedBy };
    }
    if (this.pending || !doc.data) await this.push(current);
    else if (this.state.status !== 'sincronizado') this.set({ status: 'sincronizado' });
    return null;
  }

  async reset(): Promise<TripData> {
    const seed = await this.local.reset();
    await this.save(seed);
    return seed;
  }

  async versions(): Promise<VersionInfo[]> {
    const res = await this.fetchImpl(`${this.url}?versions=1`, { headers: this.headers(), cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo leer el historial');
    return ((await res.json()) as { versions: VersionInfo[] }).versions;
  }

  async version(revision: number): Promise<TripData> {
    const res = await this.fetchImpl(`${this.url}?revision=${revision}`, { headers: this.headers(), cache: 'no-store' });
    if (!res.ok) throw new Error('Esa versión ya no está disponible');
    const p = parseTrip(((await res.json()) as RemoteDoc).data);
    if (!p.ok) throw new Error('Versión inválida');
    return p.data;
  }
}

