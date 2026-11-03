import { timingSafeEqual } from 'node:crypto';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Clave de acceso opcional (APP_ACCESS_KEY). Si no está configurada, no se exige. */
export function checkAccess(req: Request, expected: string | undefined): boolean {
  if (!expected) return true;
  const got = req.headers.get('x-app-key') ?? '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Límite de uso en memoria, por IP. Es un respaldo por instancia: el límite principal
 * lo aplica Netlify con `config.rateLimit`. Igual conviene fijar un tope mensual en OpenAI.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear(); // evita crecer sin control
    return true;
  }
}

export function clientIp(req: Request, contextIp?: string): string {
  return contextIp ?? req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
}
