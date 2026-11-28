import { describe, it, expect } from 'vitest';

import {
  amountFromConverted,
  compactCurrencyFormat,
  currencyFormat,
  currencySymbol,
  currencyTolerance,
  payRateFromTotal,
  totalFromPayRate
} from '@/utils';

describe('totalFromPayRate', () => {
  it('multiplies the pay rate by the billable hours', () => {
    expect(totalFromPayRate(25, 7.5 * 60)).toBe(187.5);
    expect(totalFromPayRate('30', 90)).toBe(45);
  });

  it('returns undefined for a missing or non-numeric pay rate', () => {
    expect(totalFromPayRate(undefined, 60)).toBeUndefined();
    expect(totalFromPayRate(null, 60)).toBeUndefined();
    expect(totalFromPayRate('', 60)).toBeUndefined();
    expect(totalFromPayRate(NaN, 60)).toBeUndefined();
  });

  it('treats negative minutes as no billable time', () => {
    expect(totalFromPayRate(25, -30)).toBe(0);
  });
});

describe('payRateFromTotal', () => {
  it('gives a clean pay rate when the total divides evenly', () => {
    expect(payRateFromTotal(187.5, 7.5 * 60)).toBe(25);
    expect(payRateFromTotal(0, 60)).toBe(0);
  });

  it('keeps enough decimals to give back the same total to the cent', () => {
    const minutes = 7 * 60 + 20; // 7h 20m
    const rate = payRateFromTotal(200, minutes)!;

    expect(rate).toBe(27.2727); // 27.27 would only total 199.98
    expect(totalFromPayRate(rate, minutes)!.toFixed(2)).toBe('200.00');
  });

  it('round-trips totals for a range of shift lengths', () => {
    for (const minutes of [1, 7, 45, 61, 199, 437, 600, 1439]) {
      for (const total of [0.01, 9.99, 123.45, 199.99, 200, 1234.56]) {
        const back = totalFromPayRate(payRateFromTotal(total, minutes)!, minutes)!;
        expect(back.toFixed(2)).toBe(total.toFixed(2));
        expect(Math.round(back * 100)).toBe(Math.round(total * 100));
      }
    }
  });

  it('works from a total in another currency', () => {
    const minutes = 7 * 60 + 20;
    const vnd = 17165;
    const rate = payRateFromTotal(3_000_000, minutes, vnd, currencyTolerance('VND'))!;

    expect(Math.round(totalFromPayRate(rate, minutes)! * vnd)).toBe(3_000_000);
  });

  it('returns undefined when the pay rate cannot be worked out', () => {
    expect(payRateFromTotal(100, 0)).toBeUndefined();
    expect(payRateFromTotal(-5, 60)).toBeUndefined();
    expect(payRateFromTotal(NaN, 60)).toBeUndefined();
  });
});

describe('amountFromConverted', () => {
  it('turns a converted amount back with as few decimals as it needs', () => {
    expect(amountFromConverted(15, 0.5)).toBe(30);
    expect(amountFromConverted(20, 0.66401)).toBe(30.12);
    expect(amountFromConverted(-1, 0.5)).toBeUndefined();
    expect(amountFromConverted(10, 0)).toBeUndefined();
  });
});

describe('currency formatting', () => {
  const format = (value: number, currency: string, options: Intl.NumberFormatOptions = {}) =>
    Intl.NumberFormat([], { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...options }).format(value);

  it('uses symbols rather than currency codes', () => {
    expect(currencyFormat(12.5)).toBe(format(12.5, 'AUD'));
    expect(currencyFormat(12.5, 'USD')).toBe(format(12.5, 'USD'));
    expect(currencyFormat(12.5, 'USD')).not.toContain('USD');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('VND')).toBe('₫');
  });

  it('puts the symbol before or after the number', () => {
    expect(currencyFormat(1234.5, 'USD', {}, 'before')).toBe('$1,234.50');
    expect(currencyFormat(1234.5, 'USD', {}, 'after')).toBe('1,234.50$');
    expect(currencyFormat(-5, 'EUR', {}, 'after')).toBe('-5.00€');
    expect(currencyFormat(-5, 'EUR', {}, 'before')).toBe('-€5.00');
    // Symbols made of letters keep a space
    expect(currencyFormat(20, 'CHF', { maximumFractionDigits: 0 }, 'after')).toBe('20\u00a0CHF');
  });

  it('formats compactly for small spaces, in either position', () => {
    expect(compactCurrencyFormat(1876.5, 'EUR', 'before')).toBe('€1.9K');
    expect(compactCurrencyFormat(1876.5, 'EUR', 'after')).toBe('1.9K€');
  });
});
