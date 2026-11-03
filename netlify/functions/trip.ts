import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { RateLimiter, checkAccess, clientIp, json } from './_shared/http';
import { MAX_TRIP_BYTES, getTrip, putTrip, type DocStore, type TripDoc, type VersionInfo } from './_shared/trip-core';

const DOC_KEY = 'trip';
const snapKey = (r: number) => `h/${String(r).padStart(8, '0')}`;

/** Adaptador de Netlify Blobs con lectura consistente y escritura condicional por ETag. */
function blobsStore(): DocStore {
  const store = getStore({ name: 'eurotrip', consistency: 'strong' });
  return {
    async getDoc() {
      const r = await store.getWithMetadata(DOC_KEY, { type: 'json' });
      return r ? { doc: r.data as TripDoc, etag: r.etag ?? '' } : null;
    },
    async putDoc(doc, etag) {
      const res = etag ? await store.setJSON(DOC_KEY, doc, { onlyIfMatch: etag }) : await store.setJSON(DOC_KEY, doc, { onlyIfNew: true });
      return res.modified;
    },
    async putSnapshot(doc) {
      const meta: VersionInfo = { revision: doc.revision, updatedAt: doc.updatedAt, ...(doc.updatedBy ? { updatedBy: doc.updatedBy } : {}) };
      await store.setJSON(snapKey(doc.revision), doc, { metadata: { ...meta } });
    },
    async listSnapshots() {
      const { blobs } = await store.list({ prefix: 'h/' });
      const out: VersionInfo[] = [];
      for (const b of blobs) {
        const m = await store.getMetadata(b.key);
        const meta = (m?.metadata ?? {}) as Partial<VersionInfo>;
        const revision = meta.revision ?? Number(b.key.slice(2));
        out.push({ revision, updatedAt: meta.updatedAt ?? '', ...(meta.updatedBy ? { updatedBy: meta.updatedBy } : {}) });
      }
      return out;
    },
    async getSnapshot(r) {
      return ((await store.get(snapKey(r), { type: 'json' })) as TripDoc | null) ?? null;
    },
    async deleteSnapshot(r) {
      await store.delete(snapKey(r));
    },
  };
}

// Respaldo por instancia para escrituras: 30 por minuto por IP.
const writes = new RateLimiter(30, 60_000);

export default async (req: Request, context: Context): Promise<Response> => {
  if (!checkAccess(req, process.env.APP_ACCESS_KEY)) return json({ error: 'Clave de acceso incorrecta' }, 401);
  const store = blobsStore();

  try {
    if (req.method === 'GET') {
      const r = await getTrip(store, new URL(req.url).searchParams);
      return json(r.body, r.status);
    }
    if (req.method === 'PUT') {
      if (!writes.allow(clientIp(req, context.ip))) return json({ error: 'Demasiados cambios seguidos. Espera un momento.' }, 429);
      const raw = await req.text();
      if (raw.length > MAX_TRIP_BYTES) return json({ error: 'Datos demasiado grandes' }, 413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'JSON inválido' }, 400);
      }
      const r = await putTrip(store, body);
      return json(r.body, r.status);
    }
    return json({ error: 'Método no permitido' }, 405, { allow: 'GET, PUT' });
  } catch (e) {
    console.error('trip: error', e instanceof Error ? e.message : e);
    return json({ error: 'No se pudo acceder a los datos compartidos' }, 500);
  }
};

export const config: Config = {
  path: '/api/trip',
  method: ['GET', 'PUT'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
