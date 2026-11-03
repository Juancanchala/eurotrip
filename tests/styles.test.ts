import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Protege contra hojas de estilo truncadas: toda clase usada en un componente debe existir en el CSS. */
const root = join(__dirname, '..', 'src');
const css = ['styles/app.css', 'styles/modules.css'].map((f) => readFileSync(join(root, f), 'utf-8')).join('\n');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

// Clases que son solo marcadores de estado o de JS, sin estilo propio.
const NO_STYLE = new Set(['history', 'cm', 'place-row', 'verdict-main', 'u', 'b', 'on', 'sel', 'warn', 'invalid', 'casa', 'ruta', 'transatlantico', 'info', 'aviso', 'error', 'r', 'sub', 'over', 'estimado', 'cotizado', 'reservado', 'tren', 'vuelo', 'bus', 'auto', 'small', 'typing']);

describe('estilos', () => {
  it('cada clase usada en los componentes existe en el CSS', () => {
    const missing = new Set<string>();
    for (const file of tsxFiles(root)) {
      const src = readFileSync(file, 'utf-8');
      for (const m of src.matchAll(/className="([^"]+)"/g)) {
        for (const cls of m[1]!.split(/\s+/)) {
          if (!cls || NO_STYLE.has(cls)) continue;
          const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (!new RegExp('\\.' + escaped + '(?![\\w-])').test(css)) missing.add(`${cls} (${file.slice(root.length + 1)})`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('las secciones principales de estilos están presentes', () => {
    for (const s of ['Boletos de escenario', 'Barras con rango', 'Itinerario', 'Editor de datos', 'Lista de precios', 'Mapa', 'Sincronización']) {
      expect(css).toContain(`/* ---------- ${s} ---------- */`);
    }
  });
});
