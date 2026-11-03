import { useEffect, useRef, useState, type FormEvent } from 'react';
import { askAgent, getAccessKey, setAccessKey, type AgentFailure, type ChatTurn } from '../../lib/agent';
import { useTrip } from '../../lib/store';

const TOOL_LABEL: Record<string, string> = {
  comparar_escenarios: 'comparó escenarios',
  detalle_escenario: 'revisó el detalle',
  simular_noches: 'simuló noches',
  evaluar_extras: 'evaluó extras',
  que_cotizar: 'buscó qué cotizar',
};

/** Texto simple con párrafos, listas "- " y **negritas**, sin HTML inyectado. */
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{bold(l.replace(/^\s*[-•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {bold(l)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function Asistente() {
  const { data, currency } = useTrip();
  const sel = data.settings.selectedScenarioId;
  const others = data.scenarios.filter((s) => s.id !== sel).map((s) => s.id);
  const suggestions = [
    `Compara ${sel} y ${others[0] ?? 'B'}`,
    '¿Qué pasa si agregamos un día más en París?',
    `¿Cabe Barcelona con el escenario ${sel}?`,
    '¿Qué debo cotizar primero?',
  ];

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<{ kind: AgentFailure; message: string } | null>(null);
  const [key, setKey] = useState(getAccessKey);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [turns, busy]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setFail(null);
    setBusy(true);
    setText('');
    const history = turns;
    setTurns((t) => [...t, { role: 'user', content: question }]);
    const r = await askAgent(question, history, data, currency);
    setBusy(false);
    if (r.ok) setTurns((t) => [...t, { role: 'assistant', content: r.answer, tools: r.tools }]);
    else {
      setFail({ kind: r.kind, message: r.message });
      // La pregunta no respondida vuelve al campo para reintentar.
      setTurns((t) => t.slice(0, -1));
      setText(question);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <aside className="assistant" id="asistente" aria-labelledby="ai-title">
      <div className="assistant-head">
        <strong id="ai-title">Asistente de viaje</strong>
        <span>Responde con los cálculos de la app · escenario {sel}</span>
      </div>

      <div className="msgs" aria-live="polite" aria-busy={busy}>
        {turns.length === 0 && (
          <p className="msgs-empty">
            Pregunta sobre rutas, días o costos. Cada cifra sale del motor de la app, no de la imaginación del modelo.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role === 'user' ? 'u' : 'b'}`}>
            {t.role === 'assistant' ? <Rich text={t.content} /> : t.content}
            {t.tools && t.tools.length > 0 && (
              <span className="msg-tools">Calculado con el motor: {[...new Set(t.tools)].map((x) => TOOL_LABEL[x] ?? x).join(', ')}</span>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg b typing" role="status">
            <span className="sr-only">El asistente está calculando…</span>
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>

      {fail && (
        <div className="ai-fail" role="alert">
          <p>{fail.message}</p>
          {fail.kind === 'clave' && (
            <form
              className="ask"
              onSubmit={(e) => {
                e.preventDefault();
                setAccessKey(key.trim());
                setFail(null);
                void send(text);
              }}
            >
              <label className="sr-only" htmlFor="ai-key">
                Clave de acceso
              </label>
              <input id="ai-key" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Clave de acceso" />
              <button type="submit" className="btn primary">
                Guardar
              </button>
            </form>
          )}
        </div>
      )}

      <div className="sugg">
        {suggestions.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => void send(s)}>
            {s}
          </button>
        ))}
      </div>

      <form className="ask" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="ai-q">
          Pregunta al asistente
        </label>
        <input
          ref={input}
          id="ai-q"
          type="text"
          maxLength={600}
          autoComplete="off"
          placeholder="Pregunta sobre la ruta, costos o días…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="send" aria-label="Enviar pregunta" disabled={busy || text.trim().length < 2}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {turns.length > 0 && (
        <button type="button" className="link-btn" onClick={() => setTurns([])}>
          Nueva conversación
        </button>
      )}
    </aside>
  );
}
