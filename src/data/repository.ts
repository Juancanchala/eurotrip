import type { TripData } from '../engine/types';
import { parseTrip } from './schema';
import seedJson from './seed.json';

/**
 * Capa de acceso a datos. La UI solo conoce esta interfaz, así que migrar
 * a Supabase o Netlify Blobs consiste en escribir otra implementación.
 */
export interface TripRepository {
  load(): Promise<TripData>;
  save(data: TripData): Promise<void>;
  reset(): Promise<TripData>;
}

export function seedData(): TripData {
  const r = parseTrip(seedJson);
  if (!r.ok) throw new Error(`Seed inválido:\n${r.errors.join('\n')}`);
  return structuredClone(r.data);
}

/** Mínimo de Storage que necesitamos (permite pruebas sin navegador). */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const STORAGE_KEY = 'eurotrip:data:v1';
export const CORRUPT_KEY = 'eurotrip:data:corrupt';

function safeStorage(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export class LocalStorageTripRepository implements TripRepository {
  constructor(private readonly store: KeyValueStore | null = safeStorage()) {}

  async load(): Promise<TripData> {
    const raw = this.read(STORAGE_KEY);
    if (!raw) return seedData();
    try {
      const r = parseTrip(JSON.parse(raw));
      if (r.ok) return r.data;
      console.warn('Datos guardados inválidos, se usa el seed.', r.errors);
    } catch {
      console.warn('Datos guardados ilegibles, se usa el seed.');
    }
    // No se pierden: se guarda una copia para recuperarlos.
    this.write(CORRUPT_KEY, raw);
    return seedData();
  }

  async save(data: TripData): Promise<void> {
    const r = parseTrip(data);
    if (!r.ok) throw new Error(`No se guardó: ${r.errors[0]}`);
    this.write(STORAGE_KEY, JSON.stringify(r.data));
  }

  async reset(): Promise<TripData> {
    try {
      this.store?.removeItem(STORAGE_KEY);
    } catch {
      /* sin almacenamiento */
    }
    return seedData();
  }

  private read(k: string): string | null {
    try {
      return this.store?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }

  private write(k: string, v: string) {
    try {
      this.store?.setItem(k, v);
    } catch {
      /* cuota llena o modo privado: la app sigue funcionando en memoria */
    }
  }
}

/** Exporta los datos como JSON descargable (respaldo). */
export function exportTrip(data: TripData): string {
  return JSON.stringify(data, null, 2);
}

/** Importa un respaldo, validándolo antes de aceptarlo. */
export function importTrip(json: string): { ok: true; data: TripData } | { ok: false; errors: string[] } {
  try {
    return parseTrip(JSON.parse(json));
  } catch {
    return { ok: false, errors: ['El archivo no es un JSON válido'] };
  }
}
