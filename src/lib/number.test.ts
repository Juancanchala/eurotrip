import { describe, expect, it } from 'vitest';
import { formatNumber, parseNumber } from './number';

describe('números al estilo colombiano', () => {
  it.each([
    ['2.000.000', 2_000_000],
    ['$ 2.000.000', 2_000_000],
    ['6.300.000 COP', 6_300_000],
    ['2000000', 2_000_000],
    ['1.300', 1300],
    ['€ 1.300', 1300],
    ['1,5', 1.5],
    ['12.5', 12.5],
    ['4.635', 4635],
    ['2.000.000,50', 2_000_000.5],
    ['2,000,000', 2_000_000],
    ['1,234.5', 1234.5],
    ['-3', -3],
    ['−3', -3],
    ['0', 0],
  ])('"%s" → %d', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '2.00.000', '-', '1,2,3'])('rechaza "%s"', (input) => {
    expect(parseNumber(input)).toBeNull();
  });

  it('formatea y vuelve a leer lo mismo', () => {
    for (const n of [0, 7, 1300, 2_000_000, 1.5, 4635.25, -42]) {
      expect(parseNumber(formatNumber(n))).toBe(n);
    }
    expect(formatNumber(6_000_000)).toBe('6.000.000');
    expect(formatNumber(1.5)).toBe('1,5');
  });
});
