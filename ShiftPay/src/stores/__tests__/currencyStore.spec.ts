import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api', () => ({
  default: { exchangeRates: { latest: vi.fn() } }
}));

import api from '@/api';
import { RATES_MAX_AGE_MS, parseExchangeRates, parseRatesResponse, useCurrencyStore } from '@/stores/currencyStore';
import { STATUS } from '@/types';
import { currencyFormat, currencySymbol } from '@/utils';

const latest = vi.mocked(api.exchangeRates.latest);

// Shape returned by https://api.frankfurter.dev/v2/rates?base=AUD
const RESPONSE = [
  { date: '2026-11-27', base: 'AUD', quote: 'EUR', rate: 0.60538 },
  { date: '2026-11-27', base: 'AUD', quote: 'USD', rate: 0.66401 },
  { date: '2026-11-27', base: 'AUD', quote: 'VND', rate: 17165 }
];

const NOW = new Date(2026, 10, 28, 9, 0).getTime();

describe('currencyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    latest.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses the Frankfurter v2 response', () => {
    expect(parseRatesResponse(RESPONSE, NOW)).toEqual({
      base: 'AUD',
      date: '2026-11-27',
      fetchedAt: NOW,
      rates: { EUR: 0.60538, USD: 0.66401, VND: 17165 }
    });
  });

  it('rejects a response without usable rates', () => {
    expect(() => parseRatesResponse([])).toThrow();
    expect(() => parseRatesResponse([{ date: '2026-11-27', base: 'USD', quote: 'EUR', rate: 0.9 }])).toThrow();
  });

  it('ignores unusable cached rates', () => {
    expect(parseExchangeRates(null)).toBeNull();
    expect(parseExchangeRates({ base: 'USD', date: '2026-11-27', fetchedAt: NOW, rates: { EUR: 1 } })).toBeNull();
    expect(parseExchangeRates({ base: 'AUD', date: '2026-11-27', fetchedAt: NOW, rates: { usd: 'x' } })).toBeNull();
  });

  it('shows the pay currency and stays offline by default', async () => {
    const store = useCurrencyStore();
    await store.fetch();

    expect(store.displayCurrency).toBe('AUD');
    expect(store.isConverting).toBe(false);
    expect(store.format(12.5)).toBe(currencyFormat(12.5, 'AUD'));
    expect(latest).not.toHaveBeenCalled();
  });

  it('downloads rates and converts amounts after picking a currency', async () => {
    latest.mockResolvedValue(RESPONSE);
    const store = useCurrencyStore();
    store.enableAutoPersist();

    await store.setDisplayCurrency('usd');

    expect(latest).toHaveBeenCalledWith('AUD');
    expect(store.displayCurrency).toBe('USD');
    expect(store.isConverting).toBe(true);
    expect(store.convert(100)).toBeCloseTo(66.401);
    expect(store.format(100)).toBe(currencyFormat(66.401, 'USD'));
    expect(store.availableCurrencies).toEqual(['AUD', 'EUR', 'USD', 'VND']);

    await Promise.resolve(); // let the persistence subscription run
    expect(localStorage.getItem('displayCurrency')).toBe('USD');
    expect(JSON.parse(localStorage.getItem('exchangeRates')!).rates.USD).toBe(0.66401);
  });

  it('uses fresh cached rates without going online', async () => {
    localStorage.setItem('displayCurrency', 'EUR');
    localStorage.setItem(
      'exchangeRates',
      JSON.stringify({ base: 'AUD', date: '2026-11-27', fetchedAt: NOW - 60_000, rates: { EUR: 0.6 } })
    );

    const store = useCurrencyStore();
    await store.fetch();

    expect(latest).not.toHaveBeenCalled();
    expect(store.convert(10)).toBeCloseTo(6);
  });

  it('refreshes stale rates, and keeps the old ones if the refresh fails', async () => {
    localStorage.setItem('displayCurrency', 'EUR');
    localStorage.setItem(
      'exchangeRates',
      JSON.stringify({ base: 'AUD', date: '2026-11-20', fetchedAt: NOW - RATES_MAX_AGE_MS - 1, rates: { EUR: 0.6 } })
    );
    latest.mockRejectedValue(new Error('offline'));

    const store = useCurrencyStore();
    await expect(store.fetch()).rejects.toThrow('Could not load exchange rates');

    expect(latest).toHaveBeenCalledTimes(1);
    expect(store.status).toBe(STATUS.Error);
    expect(store.convert(10)).toBeCloseTo(6);
    expect(store.activeCurrency).toBe('EUR');
  });

  it('falls back to the pay currency when there is no rate at all', async () => {
    latest.mockRejectedValue(new Error('offline'));
    const store = useCurrencyStore();

    await expect(store.setDisplayCurrency('VND')).rejects.toThrow();

    expect(store.displayCurrency).toBe('VND');
    expect(store.isMissingRate).toBe(true);
    expect(store.activeCurrency).toBe('AUD');
    expect(store.format(12.5)).toBe(currencyFormat(12.5, 'AUD'));
  });

  it('puts the symbol before the amount by default, and remembers a change', async () => {
    const store = useCurrencyStore();
    store.enableAutoPersist();
    expect(store.symbolPosition).toBe('before');

    store.setSymbolPosition('after');
    await Promise.resolve(); // let the persistence subscription run
    expect(localStorage.getItem('currencySymbolPosition')).toBe('after');

    setActivePinia(createPinia());
    const reloaded = useCurrencyStore();
    await reloaded.fetch();
    expect(reloaded.symbolPosition).toBe('after');

    expect(() => reloaded.setSymbolPosition('left' as never)).toThrow('Invalid symbol position');

    // Every formatted amount follows it
    expect(reloaded.format(1234.5)).toBe(currencyFormat(1234.5, 'AUD', {}, 'after'));
    expect(reloaded.format(1234.5).endsWith(currencySymbol('AUD'))).toBe(true);
  });

  it('rejects invalid currency codes', async () => {
    const store = useCurrencyStore();
    await expect(store.setDisplayCurrency('dollars')).rejects.toThrow('Invalid currency code');
    expect(store.displayCurrency).toBe('AUD');
  });
});
