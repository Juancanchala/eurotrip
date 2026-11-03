import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CloudTripRepository, ConflictError, type SyncState } from '../data/cloud';
import { seedData } from '../data/repository';
import { migrateTrip } from '../data/migrations';
import { effectiveRate, type Currency } from '../engine/money';
import type { TripData } from '../engine/types';

interface TripContextValue {
  data: TripData;
  /** Aplica un cambio inmutable; se guarda para toda la familia. */
  update: (fn: (draft: TripData) => TripData) => void;
  /** Edita una copia profunda de los datos (más cómodo para formularios). */
  mutate: (fn: (draft: TripData) => void) => void;
  replace: (data: TripData) => void;
  reset: () => Promise<void>;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Tasa EUR→COP con colchón: la única que usa la UI para convertir. */
  rate: number;
  saveError: string | null;
  sync: SyncState;
  /** Aviso de sincronización (p. ej. cambios de otra persona). */
  notice: string | null;
  dismissNotice: () => void;
  repo: CloudTripRepository;
}

const TripContext = createContext<TripContextValue | null>(null);

const CURRENCY_KEY = 'eurotrip:currency';
const SAVE_DELAY = 700;
const REFRESH_EVERY = 45_000;

function readCurrency(): Currency {
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'EUR' ? 'EUR' : 'COP';
  } catch {
    return 'COP';
  }
}

export function TripProvider({ children, repo }: { children: ReactNode; repo?: CloudTripRepository }) {
  const repository = useMemo(() => repo ?? new CloudTripRepository(), [repo]);
  // El seed se muestra al instante; los datos compartidos lo reemplazan al cargar.
  const [data, setData] = useState<TripData>(() => seedData());
  const [loaded, setLoaded] = useState(false);
  const [currency, setCurrencyState] = useState<Currency>(readCurrency);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: 'cargando', revision: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Última versión que coincide con la guardada; si los datos son iguales no se vuelve a guardar. */
  const synced = useRef<string>('');
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => repository.subscribe(setSync), [repository]);

  const adopt = useCallback((d: TripData) => {
    synced.current = JSON.stringify(d);
    setData(d);
  }, []);

  useEffect(() => {
    let alive = true;
    repository.load().then((d) => {
      if (!alive) return;
      const m = migrateTrip(d, seedData());
      adopt(d);
      if (m.changed) {
        // Se aplica como un cambio normal: se guarda para todos y la versión anterior queda en el historial.
        setData(m.data);
        setNotice(
          'Se actualizaron las rutas: A (París primero y Bernina hacia el sur), B (la inversa) y C (A con tren Madrid–París). Tus costos se conservaron; la versión anterior está en el historial.',
        );
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [repository, adopt]);

  const onConflict = useCallback(
    (e: unknown) => {
      if (e instanceof ConflictError && e.remote) {
        adopt(e.remote.data);
        setNotice(
          `${e.remote.updatedBy ?? 'Otra persona'} guardó cambios justo antes. Se cargó la versión más reciente; revisa y repite tu último cambio si hace falta.`,
        );
        return true;
      }
      return false;
    },
    [adopt],
  );

  // Guardado con retraso para no escribir en cada tecla.
  useEffect(() => {
    if (!loaded) return;
    const snapshot = JSON.stringify(data);
    if (snapshot === synced.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      repository
        .save(data)
        .then(() => {
          synced.current = snapshot;
          setSaveError(null);
        })
        .catch((e: unknown) => {
          if (!onConflict(e)) setSaveError(e instanceof Error ? e.message : 'No se pudo guardar');
        });
    }, SAVE_DELAY);
    return () => clearTimeout(timer.current);
  }, [data, loaded, repository, onConflict]);

  // Trae cambios de otros al volver a la app y cada cierto tiempo (si no hay una edición en curso).
  useEffect(() => {
    if (!loaded) return;
    const check = () => {
      if (document.visibilityState !== 'visible' || timer.current) return;
      repository
        .refresh(latest.current)
        .then((r) => {
          if (r) {
            adopt(migrateTrip(r.data, seedData()).data);
            setNotice(`Datos actualizados${r.updatedBy ? ` por ${r.updatedBy}` : ' desde otro dispositivo'}.`);
          }
        })
        .catch(onConflict);
    };
    const id = setInterval(check, REFRESH_EVERY);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, [loaded, repository, adopt, onConflict]);

  const update = useCallback((fn: (d: TripData) => TripData) => setData((d) => fn(d)), []);
  const mutate = useCallback(
    (fn: (draft: TripData) => void) =>
      update((d) => {
        const next = structuredClone(d);
        fn(next);
        return next;
      }),
    [update],
  );
  const replace = useCallback((d: TripData) => setData(d), []);
  const reset = useCallback(async () => {
    try {
      adopt(await repository.reset());
    } catch (e) {
      if (!onConflict(e)) setSaveError(e instanceof Error ? e.message : 'No se pudo restablecer');
    }
  }, [repository, adopt, onConflict]);
  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(CURRENCY_KEY, c);
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const rate = effectiveRate(data.settings.baseRate, data.settings.cushionPct);

  const value = useMemo(
    () => ({ data, update, mutate, replace, reset, currency, setCurrency, rate, saveError, sync, notice, dismissNotice, repo: repository }),
    [data, update, mutate, replace, reset, currency, setCurrency, rate, saveError, sync, notice, dismissNotice, repository],
  );
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip debe usarse dentro de <TripProvider>');
  return ctx;
}
