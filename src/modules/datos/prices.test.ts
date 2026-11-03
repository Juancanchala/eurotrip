import { describe, expect, it } from 'vitest';
import { seedData } from '../../data/repository';
import { findScenario, tripTotals } from '../../engine';
import { applyToGroup, getCost, priceGroups, withCurrency, withStatus, withValue } from './prices';

describe('lista de precios', () => {
  const d = seedData();
  const groups = priceGroups(d);
  const find = (label: string) => groups.find((g) => g.label === label)!;

  it('agrupa el mismo vuelo de varios escenarios en una sola fila', () => {
    const g = find('Milán → Madrid');
    expect(g.section).toBe('vuelos');
    expect(g.scenarios).toEqual(['A', 'C']);
    expect(g.refs).toHaveLength(2);
  });

  it('agrupa el hotel de una ciudad en todos los escenarios', () => {
    const g = find('Hotel en Chur');
    expect(g.scenarios).toEqual(['A', 'B', 'C']);
    expect(g.refs).toHaveLength(3);
  });

  it('agrupa estadías repetidas del mismo lugar dentro de un escenario', () => {
    const data = seedData();
    data.scenarios[0]!.stays.push(structuredClone(data.scenarios[0]!.stays[1]!));
    expect(priceGroups(data).find((g) => g.label === 'Hotel en Chur')!.refs).toHaveLength(4);
  });

  it('incluye comunes, extras y días en casa, en orden de secciones', () => {
    expect(groups[0]!.section).toBe('comunes');
    expect(groups.at(-1)!.section).toBe('casa');
    expect(groups.some((g) => g.section === 'extras' && g.label === 'Barcelona')).toBe(true);
  });

  it('cotizar una vez actualiza todos los escenarios y el total', () => {
    const data = seedData();
    const g = priceGroups(data).find((x) => x.label === 'Milán → Madrid')!;
    const before = tripTotals(data, findScenario(data, 'C')).total.eur;
    applyToGroup(data, g, (c) => withStatus(withValue(c, 1_500_000, 'COP', 4635), 'cotizado', '2026-11-03'));
    for (const r of g.refs) expect(getCost(data, r)).toMatchObject({ cop: 1_500_000, status: 'cotizado', checkedAt: '2026-11-03' });
    expect(tripTotals(data, findScenario(data, 'C')).total.eur).not.toBe(before);
  });
});

describe('editar un valor', () => {
  it('en pesos queda fijo y sin rango', () => {
    const c = withValue({ eur: 300, min: 180, max: 480, status: 'estimado' }, 1_400_000, 'COP', 4635);
    expect(c).toEqual({ eur: 302, cop: 1_400_000, status: 'estimado' });
  });
  it('en euros mueve el rango del estimado en proporción', () => {
    expect(withValue({ eur: 200, min: 150, max: 300, status: 'estimado' }, 400, 'EUR', 4635)).toEqual({ eur: 400, min: 300, max: 600, status: 'estimado' });
  });
  it('un cotizado en euros queda exacto', () => {
    expect(withValue({ eur: 200, status: 'cotizado' }, 250, 'EUR', 4635)).toEqual({ eur: 250, status: 'cotizado' });
  });
  it('cambiar de moneda conserva el valor', () => {
    const cop = withCurrency({ eur: 100, status: 'estimado' }, 'COP', 4635);
    expect(cop.cop).toBe(463_500);
    expect(withCurrency(cop, 'EUR', 4635).eur).toBe(100);
  });
  it('marcar como cotizado quita el rango y pone la fecha', () => {
    expect(withStatus({ eur: 300, min: 180, max: 480, status: 'estimado' }, 'cotizado', '2026-11-03')).toEqual({
      eur: 300,
      status: 'cotizado',
      checkedAt: '2026-11-03',
    });
  });
});
