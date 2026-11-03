import { describe, expect, it, vi } from 'vitest';
import { seedData } from '../../../src/data/repository';
import { AgentError, buildContext, parseAgentRequest, runAgent, runTool, type AgentRequest } from './agent-core';
import { RateLimiter, checkAccess } from './http';

const data = seedData();
const req: AgentRequest = { question: '¿Un día más en París?', history: [], currency: 'COP', data };

describe('validación de entrada', () => {
  it('acepta una pregunta con datos válidos', () => {
    expect(parseAgentRequest({ question: 'Hola, compara', data }).ok).toBe(true);
  });
  it('rechaza preguntas vacías o enormes', () => {
    expect(parseAgentRequest({ question: ' ', data }).ok).toBe(false);
    expect(parseAgentRequest({ question: 'x'.repeat(601), data }).ok).toBe(false);
  });
  it('rechaza datos del viaje inválidos', () => {
    const r = parseAgentRequest({ question: 'Compara', data: { version: 2 } });
    expect(r.ok).toBe(false);
  });
  it('limita el historial', () => {
    const history = Array.from({ length: 9 }, () => ({ role: 'user', content: 'x' }));
    expect(parseAgentRequest({ question: 'Compara', history, data }).ok).toBe(false);
  });
});

describe('contexto', () => {
  it('incluye escenario, totales, tasa, presupuesto, días y supuestos', () => {
    const ctx = JSON.parse(buildContext(data, { currency: 'COP' }));
    expect(ctx.escenario_elegido.id).toBe('A');
    expect(ctx.escenario_elegido.total_viaje.probable).toMatch(/^\$ [\d,]+ M \(€ [\d.]+\)$/);
    expect(ctx.tasa.eur_cop_aplicada).toBe(Math.round(4500 * 1.03));
    expect(ctx.viaje.presupuesto).toContain('provisional');
    expect(ctx.viaje.dias_totales).toBe(21);
    expect(ctx.supuestos.length).toBeGreaterThan(3);
  });
});

describe('herramientas: cifras del motor', () => {
  it('compara escenarios', () => {
    const r = runTool('comparar_escenarios', {}, data, 'COP') as { escenarios: unknown[]; mas_economico: string; concluyente: boolean };
    expect(r.escenarios).toHaveLength(3);
    expect(['A', 'B', 'C']).toContain(r.mas_economico);
    expect(typeof r.concluyente).toBe('boolean');
  });
  it('simula un día más en París', () => {
    const r = runTool('simular_noches', { escenario_id: 'a', lugar_id: 'paris', cambio: 1 }, data, 'EUR') as Record<string, unknown>;
    expect(r.escenario).toBe('A');
    expect(r.dias_libres_despues).toBe((r.dias_libres_antes as number) - 1);
    expect(String((r.cambio_costo_viaje as { probable: string }).probable)).toMatch(/^€ /);
  });
  it('evalúa extras por id o por nombre', () => {
    const r = runTool('evaluar_extras', { escenario_id: 'A', extra_ids: ['Barcelona'] }, data, 'COP') as Record<string, unknown>;
    expect(r.extras).toEqual(['Barcelona']);
    expect(typeof r.cabe_en_tiempo).toBe('boolean');
  });
  it('detalle con fechas de 2027 y alertas', () => {
    const r = runTool('detalle_escenario', { escenario_id: 'A' }, data, 'COP') as { salidas: { desde: string }[]; alertas: unknown[] };
    expect(r.salidas[0]!.desde).toMatch(/^2027-10-/);
    expect(Array.isArray(r.alertas)).toBe(true);
  });
  it('qué cotizar primero', () => {
    const r = runTool('que_cotizar', { escenario_id: 'C' }, data, 'COP') as { cotizar_primero: unknown[] };
    expect(r.cotizar_primero.length).toBeGreaterThan(0);
  });
  it('errores claros con ids o argumentos inválidos', () => {
    expect(runTool('detalle_escenario', { escenario_id: 'Z' }, data, 'COP')).toMatchObject({ error: expect.stringContaining('Válidos') });
    expect(runTool('simular_noches', { escenario_id: 'A', lugar_id: 'roma', cambio: 1 }, data, 'COP')).toMatchObject({ error: expect.any(String) });
    expect(runTool('simular_noches', { escenario_id: 'A', lugar_id: 'paris', cambio: 50 }, data, 'COP')).toMatchObject({ error: expect.any(String) });
    expect(runTool('borrar_todo', {}, data, 'COP')).toMatchObject({ error: expect.any(String) });
  });
});

function reply(message: unknown, usage = { prompt_tokens: 100, completion_tokens: 20 }) {
  return new Response(JSON.stringify({ choices: [{ message }], usage }), { status: 200 });
}

describe('ciclo con OpenAI (simulado)', () => {
  const cfg = { apiKey: 'sk-test', model: 'test-model', maxTokens: 500, deadlineMs: 10_000 };

  it('ejecuta las herramientas pedidas y devuelve la respuesta final', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        reply({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'simular_noches', arguments: '{"escenario_id":"A","lugar_id":"paris","cambio":1}' } }],
        }),
      )
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Sube el costo. Conclusión: vale la pena.' }));

    const r = await runAgent(req, data, { ...cfg, fetchImpl });
    expect(r.answer).toContain('Conclusión');
    expect(r.toolsUsed).toEqual(['simular_noches']);
    expect(r.usage).toEqual({ prompt: 200, completion: 40 });

    // La segunda llamada lleva el resultado del motor como mensaje de herramienta.
    const second = JSON.parse(fetchImpl.mock.calls[1]![1].body as string);
    const toolMsg = second.messages.find((m: { role: string }) => m.role === 'tool');
    expect(JSON.parse(toolMsg.content).escenario).toBe('A');
    // La llave va solo en la cabecera hacia OpenAI.
    expect(fetchImpl.mock.calls[0]![1].headers.authorization).toBe('Bearer sk-test');
    expect(second.max_completion_tokens).toBe(500);
  });

  it('en la última vuelta obliga a responder sin herramientas', async () => {
    const toolCall = reply({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c', type: 'function', function: { name: 'comparar_escenarios', arguments: '{}' } }],
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(toolCall)
      .mockResolvedValueOnce(reply({ role: 'assistant', content: null, tool_calls: [{ id: 'd', type: 'function', function: { name: 'comparar_escenarios', arguments: '{}' } }] }))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: null, tool_calls: [{ id: 'e', type: 'function', function: { name: 'comparar_escenarios', arguments: '{}' } }] }))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Listo. Conclusión: C.' }));
    const r = await runAgent(req, data, { ...cfg, fetchImpl });
    expect(r.answer).toBe('Listo. Conclusión: C.');
    expect(JSON.parse(fetchImpl.mock.calls[3]![1].body as string).tool_choice).toBe('none');
  });

  it('traduce errores de OpenAI sin filtrar detalles', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"error":{"message":"cuenta xyz sin saldo"}}', { status: 401 }));
    await expect(runAgent(req, data, { ...cfg, fetchImpl })).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining('xyz') });
  });

  it('respuesta vacía es un error claro', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ role: 'assistant', content: '' }));
    await expect(runAgent(req, data, { ...cfg, fetchImpl })).rejects.toBeInstanceOf(AgentError);
  });
});

describe('seguridad', () => {
  const r = (key?: string) => new Request('https://x/api/agent', { method: 'POST', headers: key ? { 'x-app-key': key } : {} });
  it('sin clave configurada no exige nada', () => {
    expect(checkAccess(r(), undefined)).toBe(true);
  });
  it('con clave configurada exige la correcta', () => {
    expect(checkAccess(r('familia2027'), 'familia2027')).toBe(true);
    expect(checkAccess(r('otra'), 'familia2027')).toBe(false);
    expect(checkAccess(r(), 'familia2027')).toBe(false);
  });
  it('limita por IP en la ventana', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow('ip', 0)).toBe(true);
    expect(rl.allow('ip', 10)).toBe(true);
    expect(rl.allow('ip', 20)).toBe(false);
    expect(rl.allow('otra', 20)).toBe(true);
    expect(rl.allow('ip', 1500)).toBe(true);
  });
});
