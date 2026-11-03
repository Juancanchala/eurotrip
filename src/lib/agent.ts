import type { Currency } from '../engine/money';
import type { TripData } from '../engine/types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
}

export type AgentFailure = 'clave' | 'limite' | 'no_configurado' | 'no_disponible' | 'error';

const KEY_STORAGE = 'eurotrip:access-key';

export function getAccessKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setAccessKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* sin almacenamiento */
  }
}

export async function askAgent(
  question: string,
  history: ChatTurn[],
  data: TripData,
  currency: Currency,
): Promise<{ ok: true; answer: string; tools: string[] } | { ok: false; kind: AgentFailure; message: string }> {
  let res: Response;
  try {
    res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-key': getAccessKey() },
      body: JSON.stringify({
        question,
        // Solo los últimos turnos, sin metadatos.
        history: history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 2000) })),
        currency,
        data,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, kind: 'no_disponible', message: 'No hay conexión con el asistente. El resto de la app sigue funcionando.' };
  }

  let body: { answer?: string; toolsUsed?: string[]; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* p. ej. 404 en desarrollo local sin funciones */
  }
  if (res.ok && body.answer) return { ok: true, answer: body.answer, tools: body.toolsUsed ?? [] };

  const kind: AgentFailure =
    res.status === 401 ? 'clave' : res.status === 429 ? 'limite' : res.status === 503 ? 'no_configurado' : res.status === 404 ? 'no_disponible' : 'error';
  const fallback: Record<AgentFailure, string> = {
    clave: 'Escribe la clave de acceso de la familia para usar el asistente.',
    limite: 'Demasiadas preguntas seguidas. Espera un minuto.',
    no_configurado: 'El asistente aún no está configurado en Netlify.',
    no_disponible: 'El asistente no está disponible aquí (en local usa "netlify dev"). El resto de la app sigue funcionando.',
    error: 'El asistente tuvo un problema. Intenta de nuevo.',
  };
  return { ok: false, kind, message: body.error ?? fallback[kind] };
}
