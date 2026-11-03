import { describe, expect, it } from 'vitest';
import { arc, legColor, LEG_COLORS } from './geometry';

describe('geometría del mapa', () => {
  const madrid: [number, number] = [40.4168, -3.7038];
  const paris: [number, number] = [48.8566, 2.3522];

  it('el arco empieza y termina en las paradas', () => {
    const pts = arc(madrid, paris);
    expect(pts[0]).toEqual(madrid);
    expect(pts.at(-1)![0]).toBeCloseTo(paris[0]);
    expect(pts.at(-1)![1]).toBeCloseTo(paris[1]);
  });

  it('ida y vuelta se curvan hacia lados distintos', () => {
    const ida = arc(madrid, paris);
    const vuelta = arc(paris, madrid);
    const midIda = ida[12]!;
    const midVuelta = vuelta[12]!;
    expect(Math.abs(midIda[1] - midVuelta[1]) + Math.abs(midIda[0] - midVuelta[0])).toBeGreaterThan(1);
  });

  it('colores distintos por tramo, cíclicos', () => {
    expect(legColor(0)).not.toBe(legColor(1));
    expect(legColor(LEG_COLORS.length)).toBe(legColor(0));
  });
});
