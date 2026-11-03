import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { effectiveRate, type Currency } from '../engine/money';
import type { TripData } from '../engine/types';
import { LocalStorageTripRepository, seedData, type TripRepository } from '../data/repository';

interface TripContextValue {
  data: TripData;
  /** Aplica un cambio inmutable y lo persiste a través del repository. */
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
}

const TripContext = createContext<TripContextValue | null>(null);

const CURRENCY_KEY = 'eurotrip:currency';

function readCurrency(): Currency {
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'EUR' ? 'EUR' : 'COP';
  } catch {
    return 'COP';
  }
}

export function TripProvider({ children, repo }: { children: ReactNode; repo?: TripRepository }) {
  const repository = useMemo(() => repo ?? new LocalStorageTripRepository(), [repo]);
  // El seed se muestra al instante; los datos guardados lo reemplazan al cargar.
  const [data, setData] = useState<TripData>(() => seedData());
  const [loaded, setLoaded] = useState(false);
  // Solo se guarda lo que el usuario cambia; así las mejoras del seed llegan mientras no haya ediciones.
  const dirty = useRef(false);
  const [currency, setCurrencyState] = useState<Currency>(readCurrency);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    repository.load().then((d) => {
      if (alive) {
        setData(d);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [repository]);

  // Guardado con pequeño retraso para no escribir en cada tecla.
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      repository
        .save(data)
        .then(() => setSaveError(null))
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : 'No se pudo guardar'));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [data, loaded, repository]);

  const update = useCallback((fn: (d: TripData) => TripData) => {
    dirty.current = true;
    setData((d) => fn(d));
  }, []);
  const mutate = useCallback(
    (fn: (draft: TripData) => void) =>
      update((d) => {
        const next = structuredClone(d);
        fn(next);
        return next;
      }),
    [update],
  );
  const replace = useCallback((d: TripData) => {
    dirty.current = true;
    setData(d);
  }, []);
  const reset = useCallback(async () => {
    dirty.current = false;
    setData(await repository.reset());
  }, [repository]);
  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(CURRENCY_KEY, c);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const rate = effectiveRate(data.settings.baseRate, data.settings.cushionPct);

  const value = useMemo(
    () => ({ data, update, mutate, replace, reset, currency, setCurrency, rate, saveError }),
    [data, update, mutate, replace, reset, currency, setCurrency, rate, saveError],
  );
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip debe usarse dentro de <TripProvider>');
  return ctx;
}
