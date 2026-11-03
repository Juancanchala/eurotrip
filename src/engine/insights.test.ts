import { describe, expect, it } from 'vitest';
import { fixture } from './fixture';
import { findScenario, uncertaintyDrivers } from './index';

describe('qué cotizar primero', () => {
  const data = fixture();
  const name = (id: string) => id.toUpperCase();

  it('ordena por ancho de banda e ignora lo cotizado o reservado', () => {
    const top = uncertaintyDrivers(data, findScenario(data, 'A'), name, 10);
    // Transatlántico 1800–2400 (600) > días en casa 12 × (40–60) = 240 > vuelo a1 200–400 (200)
    expect(top.map((t) => t.label)).toEqual(['Transatlántico', 'Gasto de los días en casa', 'MAD → CHU']);
    // El tren cotizado y el hotel reservado en París no aparecen.
    expect(top.some((t) => t.label.includes('PAR (3'))).toBe(false);
  });

  it('respeta el límite', () => {
    expect(uncertaintyDrivers(data, findScenario(data, 'A'), name, 1)).toHaveLength(1);
  });
});
