import { describe, expect, it } from 'vitest';
import { fixture } from './fixture';
import {
  add,
  compareScenarios,
  daysUsed,
  effectiveRate,
  evaluateCombo,
  evaluateExtra,
  findScenario,
  fitOf,
  formatCOP,
  formatCOPShort,
  formatEUR,
  formatMoney,
  freeDays,
  groupThousands,
  hoursInTransit,
  nightsByPlace,
  overlaps,
  rangeOf,
  scale,
  scenarioTotals,
  simulateNights,
  stopsOf,
  sub,
  tripTotals,
  validateTrip,
  withNights,
} from './index';

const data = fixture();
const A = findScenario(data, 'A');
const B = findScenario(data, 'B');

describe('rangos', () => {
  it('usa eur cuando faltan min/max y ordena extremos', () => {
    expect(rangeOf({ eur: 10, status: 'estimado' })).toEqual({ eur: 10, min: 10, max: 10 });
    expect(rangeOf({ eur: 10, min: 20, max: 5, status: 'estimado' })).toEqual({ eur: 10, min: 5, max: 20 });
  });
  it('suma, escala y resta propagando peor/mejor caso', () => {
    const a = { eur: 10, min: 8, max: 12 };
    const b = { eur: 5, min: 4, max: 6 };
    expect(add(a, b)).toEqual({ eur: 15, min: 12, max: 18 });
    expect(scale(a, 2)).toEqual({ eur: 20, min: 16, max: 24 });
    expect(scale(a, -1)).toEqual({ eur: -10, min: -12, max: -8 });
    expect(sub(a, b)).toEqual({ eur: 5, min: 2, max: 8 });
  });
  it('detecta bandas que se cruzan', () => {
    expect(overlaps({ eur: 5, min: 0, max: 10 }, { eur: 12, min: 9, max: 15 })).toBe(true);
    expect(overlaps({ eur: 5, min: 0, max: 8 }, { eur: 12, min: 9, max: 15 })).toBe(false);
  });
});

describe('días', () => {
  it('abierto: noches + 1 regreso', () => {
    expect(daysUsed(A, data.settings)).toBe(6); // 5 noches + 1
    expect(freeDays(A, data.settings)).toBe(12); // 20 − 2 − 6
  });
  it('ida y vuelta: noches + 2 regresos', () => {
    expect(daysUsed(B, data.settings)).toBe(6); // 4 noches + 2
  });
  it('horas, paradas y noches por lugar', () => {
    expect(hoursInTransit(A)).toBe(17);
    expect(stopsOf(A)).toEqual(['mad', 'chu', 'par', 'mad']);
    expect(nightsByPlace(A)).toEqual({ chu: 2, par: 3 });
  });
});

describe('totales', () => {
  it('suma por categoría', () => {
    const t = scenarioTotals(A);
    expect(t.byCategory.vuelos).toEqual({ eur: 550, min: 450, max: 650 });
    expect(t.byCategory.trenes).toEqual({ eur: 200, min: 150, max: 300 });
    expect(t.byCategory.hospedaje).toEqual({ eur: 1150, min: 1000, max: 1300 }); // 2×200 + 3×250(200–300)
    expect(t.byCategory.comidas.eur).toBe(560); // 2×100 + 3×120
    expect(t.byCategory.local.eur).toBe(190); // 2×20 + 3×50
    expect(t.total.eur).toBe(2650);
  });
  it('mide la certeza por estado', () => {
    const t = scenarioTotals(A);
    expect(t.certainty.cotizado).toBe(200);
    expect(t.certainty.reservado).toBe(750);
    expect(t.certainty.firmShare).toBeCloseTo(950 / 2650);
  });
  it('total del viaje = escenario + comunes + días en casa', () => {
    const t = tripTotals(data, A);
    expect(t.common).toEqual({ eur: 2000, min: 1800, max: 2400 });
    expect(t.homeDays).toEqual({ eur: 600, min: 480, max: 720 }); // 12 días × 50 (40–60)
    expect(t.total.eur).toBe(5250);
    expect(t.remaining.eur).toBe(-250);
    expect(t.remaining.min).toBe(5000 - t.total.max);
    expect(t.costPerDayAway.eur).toBeCloseTo(2650 / 6);
  });
  it('días libres negativos no restan costo de casa', () => {
    const d = fixture();
    d.settings.totalDays = 5;
    const t = tripTotals(d, findScenario(d, 'A'));
    expect(t.freeDays).toBeLessThan(0);
    expect(t.homeDays.eur).toBe(0);
  });
  it('cambiar el presupuesto cambia solo el restante', () => {
    const d = fixture();
    d.settings.budgetEUR = 6000;
    expect(tripTotals(d, findScenario(d, 'A')).remaining.eur).toBe(750);
  });
});

describe('proyección a la fecha del viaje', () => {
  it('ajusta solo los costos estimados', () => {
    const base = scenarioTotals(A);
    const adj = scenarioTotals(A, { adjustPct: 10, rate: 1 });
    // Firmes en A: tren cotizado (200) y París reservado (3 × 250 = 750) → no cambian.
    expect(adj.total.eur).toBeCloseTo(950 + (base.total.eur - 950) * 1.1);
    expect(adj.byCategory.trenes).toEqual(base.byCategory.trenes);
    expect(adj.byCategory.vuelos.eur).toBeCloseTo(550 * 1.1);
  });
  it('se aplica a comunes, días en casa y extras desde los ajustes', () => {
    const d = fixture();
    d.settings.priceAdjustPct = 10;
    const t = tripTotals(d, findScenario(d, 'A'));
    expect(t.common.eur).toBeCloseTo(2200);
    expect(t.homeDays.eur).toBeCloseTo(660);
    expect(evaluateExtra(d, findScenario(d, 'A'), d.extras[0]!).netCost.eur).toBeCloseTo(110);
  });
  it('costos fijados en COP se convierten con la tasa y no se ajustan', () => {
    const d = fixture();
    d.settings.priceAdjustPct = 10;
    d.common = [{ id: 'ida', label: 'Ida', cost: { eur: 1000, cop: 6_000_000, status: 'cotizado' } }];
    const t = tripTotals(d, findScenario(d, 'A'));
    expect(t.common.eur).toBeCloseTo(6_000_000 / 4200); // tasa 4000 + 5 %
    expect(t.common.min).toBe(t.common.max);
    // Mostrado en COP con la misma tasa, vuelve exacto a los 6 M pagados.
    expect(t.common.eur * effectiveRate(4000, 5)).toBeCloseTo(6_000_000);
  });
  it('datos guardados sin el campo reciben el valor por defecto', async () => {
    const { parseTrip } = await import('../data/schema');
    const d = fixture() as unknown as { settings: Record<string, unknown> };
    delete d.settings.priceAdjustPct;
    const r = parseTrip(d);
    expect(r.ok && r.data.settings.priceAdjustPct).toBe(4);
  });
});

describe('extras', () => {
  it('Toledo cabe en tiempo; costo neto descuenta el día en casa', () => {
    const e = evaluateExtra(data, A, data.extras[0]!);
    expect(e.fitsTime).toBe(true);
    expect(e.netCost).toEqual({ eur: 100, min: 40, max: 160 }); // 150(100–200) − 50(40–60)
    expect(e.freeDaysAfter).toBe(11);
  });
  it('un extra de 20 días no cabe en tiempo', () => {
    expect(evaluateExtra(data, A, data.extras[1]!).fitsTime).toBe(false);
  });
  it('fitOf clasifica según el peor y mejor caso', () => {
    expect(fitOf({ eur: 10, min: 1, max: 20 })).toBe('si');
    expect(fitOf({ eur: 1, min: -5, max: 5 })).toBe('quizas');
    expect(fitOf({ eur: -10, min: -20, max: -1 })).toBe('no');
  });
  it('combos suman días y costo', () => {
    const r = evaluateCombo(data, B, data.extras);
    expect(r.freeDaysAfter).toBe(12 - 21);
    expect(r.fitsTime).toBe(false);
  });
});

describe('simulación y comparación', () => {
  it('un día más en París', () => {
    const sim = simulateNights(data, A, 'par', 1);
    expect(sim.deltaScenario.eur).toBe(420); // 250 + 120 + 50
    expect(sim.deltaFreeDays).toBe(-1);
    expect(sim.deltaTotal.eur).toBe(370); // 420 − 50 de un día en casa
  });
  it('withNights no muta y no baja de cero', () => {
    const s2 = withNights(A, 'chu', -5);
    expect(s2.stays[0]!.nights).toBe(0);
    expect(A.stays[0]!.nights).toBe(2);
    expect(() => withNights(A, 'tol', 1)).toThrow();
  });
  it('compara y dice si la diferencia es concluyente', () => {
    const cmp = compareScenarios(data);
    expect(cmp.rows.map((r) => r.id)).toEqual(['B', 'A']);
    expect(cmp.cheapestId).toBe('B');
    expect(typeof cmp.decisive).toBe('boolean');
  });
});

describe('moneda', () => {
  it('aplica el colchón a la tasa', () => {
    expect(effectiveRate(4000, 5)).toBe(4200);
  });
  it('formatea al estilo colombiano', () => {
    expect(groupThousands(1234567)).toBe('1.234.567');
    expect(groupThousands(999)).toBe('999');
    expect(formatEUR(8540)).toBe('€ 8.540');
    expect(formatCOP(38420000)).toBe('$ 38.420.000');
    expect(formatCOPShort(38420000)).toBe('$ 38,4 M');
    expect(formatCOPShort(450000)).toBe('$ 450 mil');
    expect(formatCOPShort(-2_000_000)).toBe('−$ 2 M');
    expect(formatMoney(100, 'COP', 4200)).toBe('$ 420 mil');
    expect(formatMoney(100, 'EUR', 4200)).toBe('€ 100');
  });
});

describe('validación', () => {
  it('el fixture es coherente', () => {
    expect(validateTrip(data).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('detecta lugares inexistentes y tramos discontinuos', () => {
    const d = fixture();
    d.scenarios[0]!.legs[1]!.from = 'xxx';
    const issues = validateTrip(d);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('xxx'))).toBe(true);
    expect(issues.some((i) => i.level === 'aviso' && i.message.includes('distinto'))).toBe(true);
  });
});
