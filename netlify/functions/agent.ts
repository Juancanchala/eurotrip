import type { Config, Context } from '@netlify/functions';
import { AgentError, MAX_BODY_BYTES, parseAgentRequest, runAgent } from './_shared/agent-core';
import { RateLimiter, checkAccess, clientIp, json } from './_shared/http';

// Respaldo por instancia: 8 preguntas por minuto y 60 por día por IP.
const perMinute = new RateLimiter(8, 60_000);
const perDay = new RateLimiter(60, 86_400_000);

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, { allow: 'POST' });

  if (!checkAccess(req, process.env.APP_ACCESS_KEY)) return json({ error: 'Clave de acceso incorrecta' }, 401);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: 'El asistente no está configurado (falta OPENAI_API_KEY en Netlify).' }, 503);

  const ip = clientIp(req, context.ip);
  if (!perMinute.allow(ip) || !perDay.allow(ip)) return json({ error: 'Demasiadas preguntas seguidas. Espera un momento.' }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Solicitud demasiado grande' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  const parsed = parseAgentRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const result = await runAgent(parsed.req, parsed.data, {
      apiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      maxTokens: Math.min(Number(process.env.OPENAI_MAX_TOKENS) || 700, 2000),
      reasoningEffort: process.env.OPENAI_REASONING_EFFORT || undefined,
      deadlineMs: Number(process.env.AGENT_DEADLINE_MS) || 24_000,
    });
    return json(result);
  } catch (e) {
    if (e instanceof AgentError) return json({ error: e.message }, e.status);
    console.error('agent: error inesperado', e instanceof Error ? e.message : e);
    return json({ error: 'Error interno del asistente' }, 500);
  }
};

export const config: Config = {
  path: '/api/agent',
  method: 'POST',
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
