import { defineStore } from 'pinia';
import api from '@/api';
import { STATUS, type Status, type SymbolPosition } from '@/types';
import {
  BASE_CURRENCY,
  compactCurrencyFormat,
  currencyFormat,
  currencyFractionDigits,
  currencySymbol,
  currencyTolerance,
  withStatus
} from '@/utils';

/** Refresh cached rates after this long (reference rates only change about once a day) */
export const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type ExchangeRates = {
  base: string;
  /** Publication date of the rates (YYYY-MM-DD) */
  date: string;
  /** When the rates were downloaded (epoch ms) */
  fetchedAt: number;
  /** Units of each currency per 1 `base` */
  rates: Record<string, number>;
};

export type { SymbolPosition };

function isSymbolPosition(value: unknown): value is SymbolPosition {
  return value === 'before' || value === 'after';
}

function isCurrencyCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code);
}

function cleanRates(raw: unknown): Record<string, number> {
  const rates: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return rates;

  for (const [code, rate] of Object.entries(raw as Record<string, unknown>)) {
    const value = Number(rate);
    if (isCurrencyCode(code) && code !== BASE_CURRENCY && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }

  return rates;
}

/** Read the rates cached in localStorage; anything unusable is ignored (it can be downloaded again) */
export function parseExchangeRates(raw: unknown): ExchangeRates | null {
  if (!raw || typeof raw !== 'object') return null;

  const { base, date, fetchedAt, rates } = raw as Partial<ExchangeRates>;
  if (base !== BASE_CURRENCY || typeof date !== 'string' || !Number.isFinite(fetchedAt)) return null;

  const cleaned = cleanRates(rates);
  if (Object.keys(cleaned).length === 0) return null;

  return { base, date, fetchedAt: Number(fetchedAt), rates: cleaned };
}

/**
 * Read a Frankfurter response: `[{ date, base, quote, rate }, ...]` (v2).
 * The older `{ base, date, rates: { USD: 0.66, ... } }` shape is accepted too.
 */
export function parseRatesResponse(data: unknown, fetchedAt: number = Date.now()): ExchangeRates {
  let date: unknown;
  let rawRates: Record<string, unknown> = {};

  if (Array.isArray(data)) {
    for (const row of data as Array<{ base?: unknown; quote?: unknown; rate?: unknown; date?: unknown }>) {
      if (row?.base !== BASE_CURRENCY || typeof row.quote !== 'string') continue;
      rawRates[row.quote] = row.rate;
      if (typeof row.date === 'string' && (typeof date !== 'string' || row.date > date)) date = row.date;
    }
  } else if (data && typeof data === 'object' && (data as { base?: unknown }).base === BASE_CURRENCY) {
    date = (data as { date?: unknown }).date;
    rawRates = ((data as { rates?: Record<string, unknown> }).rates ?? {}) as Record<string, unknown>;
  }

  const rates = cleanRates(rawRates);

  if (typeof date !== 'string' || Object.keys(rates).length === 0) {
    console.error('Unexpected exchange rate response:', data);
    throw new Error('The exchange rate service returned no usable rates');
  }

  return { base: BASE_CURRENCY, date, fetchedAt, rates };
}

export const useCurrencyStore = defineStore('currency', {
  state: () => ({
    /** Currency the user wants amounts shown in */
    displayCurrency: BASE_CURRENCY as string,
    exchangeRates: null as ExchangeRates | null,
    symbolPosition: 'before' as SymbolPosition,
    status: STATUS.Ready as Status
  }),

  getters: {
    baseCurrency: (): string => BASE_CURRENCY,

    /** Units of the display currency per 1 base currency, or `null` when no rate is known */
    rate(state): number | null {
      if (state.displayCurrency === BASE_CURRENCY) return 1;
      return state.exchangeRates?.rates[state.displayCurrency] ?? null;
    },

    /** Currency amounts are actually shown in — falls back to the base currency when there is no rate */
    activeCurrency(): string {
      return this.rate === null ? BASE_CURRENCY : this.displayCurrency;
    },

    isConverting(): boolean {
      return this.activeCurrency !== BASE_CURRENCY;
    },

    /** The user picked another currency, but there is no rate for it (e.g. offline on first use) */
    isMissingRate(): boolean {
      return this.displayCurrency !== BASE_CURRENCY && this.rate === null;
    },

    availableCurrencies(state): string[] {
      const codes = new Set<string>([
        BASE_CURRENCY,
        state.displayCurrency,
        ...Object.keys(state.exchangeRates?.rates ?? {})
      ]);

      return [...codes].sort();
    },

    /** Symbol of the active currency, e.g. "$", "€", "₫" */
    symbol(): string {
      return currencySymbol(this.activeCurrency);
    },

    /** Decimal places the active currency normally shows (2 for USD, 0 for VND) */
    fractionDigits(): number {
      return currencyFractionDigits(this.activeCurrency);
    },

    /** How close a converted amount must come back to what was typed (well inside half the smallest unit) */
    tolerance(): number {
      return currencyTolerance(this.activeCurrency);
    },

    /** Convert an amount in the base currency into the active currency */
    convert(): (amount: number) => number {
      return (amount: number) => amount * (this.rate ?? 1);
    },

    /** Convert and format an amount in the base currency, e.g. "$12.34" or "12.34$" (menu > Symbol Position) */
    format(): (amount: number) => string {
      return (amount: number) => currencyFormat(this.convert(amount), this.activeCurrency, {}, this.symbolPosition);
    },

    /** Convert and format compactly for tight spaces, e.g. "$1.2K" */
    formatCompact(): (amount: number) => string {
      return (amount: number) => compactCurrencyFormat(this.convert(amount), this.activeCurrency, this.symbolPosition);
    }
  },

  actions: {
    async fetch(): Promise<void> {
      await withStatus(this, async () => {
        const savedCurrency = localStorage.getItem('displayCurrency');
        if (isCurrencyCode(savedCurrency)) {
          this.displayCurrency = savedCurrency;
        }

        const savedPosition = localStorage.getItem('currencySymbolPosition');
        if (isSymbolPosition(savedPosition)) {
          this.symbolPosition = savedPosition;
        }

        try {
          this.exchangeRates = parseExchangeRates(JSON.parse(localStorage.getItem('exchangeRates') || 'null'));
        } catch (error) {
          console.error('Ignoring unreadable cached exchange rates:', error);
          this.exchangeRates = null;
        }
      });

      // Only go online when the rates are actually needed
      if (this.displayCurrency !== BASE_CURRENCY) {
        await this.refreshRates();
      }
    },

    /** Download the latest rates unless the cached ones are still fresh and include the picked currency */
    async refreshRates(force = false): Promise<void> {
      const cached = this.exchangeRates;
      const isFresh = cached !== null && Date.now() - cached.fetchedAt < RATES_MAX_AGE_MS;
      const hasPickedCurrency =
        this.displayCurrency === BASE_CURRENCY || cached?.rates[this.displayCurrency] !== undefined;

      if (!force && isFresh && hasPickedCurrency) return;

      await withStatus(this, async () => {
        try {
          this.exchangeRates = parseRatesResponse(await api.exchangeRates.latest(BASE_CURRENCY));
        } catch (error) {
          // Keep any older cached rates; amounts fall back to the base currency only if there are none
          console.error('Failed to refresh exchange rates:', error);
          throw new Error('Could not load exchange rates', { cause: error });
        }
      });
    },

    async setDisplayCurrency(code: string): Promise<void> {
      const currency = String(code).trim().toUpperCase();
      if (!isCurrencyCode(currency)) {
        throw new Error(`Invalid currency code: ${code}`);
      }

      this.displayCurrency = currency;

      if (currency !== BASE_CURRENCY) {
        await this.refreshRates();
      }
    },

    setSymbolPosition(position: SymbolPosition): void {
      if (!isSymbolPosition(position)) {
        throw new Error(`Invalid symbol position: ${position}`);
      }

      this.symbolPosition = position;
    },

    /**
     * Call once (after Pinia is installed) to enable automatic localStorage persistence.
     * The display currency and symbol position are local preferences; they are not synced to the account.
     */
    enableAutoPersist(): void {
      this.$subscribe(
        (_mutation, state) => {
          localStorage.setItem('displayCurrency', state.displayCurrency);
          localStorage.setItem('currencySymbolPosition', state.symbolPosition);

          if (state.exchangeRates) {
            localStorage.setItem('exchangeRates', JSON.stringify(state.exchangeRates));
          } else {
            localStorage.removeItem('exchangeRates');
          }
        },
        { detached: true }
      );
    }
  }
});
