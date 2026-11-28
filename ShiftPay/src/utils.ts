import { STATUS, type Status, type SymbolPosition } from '@/types';

/** Currency that pay rates are entered and stored in */
export const BASE_CURRENCY = 'AUD';

const isWhitespace = (part: Intl.NumberFormatPart) => part.type === 'literal' && part.value.trim() === '';

/** Put the symbol before or after the number: "$1,234.50" / "1,234.50$" ("CHF 20" / "20 CHF" for letter symbols) */
function placeSymbol(parts: Intl.NumberFormatPart[], position: SymbolPosition): string {
  const symbol = parts.find((part) => part.type === 'currency')?.value;
  if (!symbol) return parts.map((part) => part.value).join('');

  const sign = parts
    .filter((part) => part.type === 'minusSign' || part.type === 'plusSign')
    .map((part) => part.value)
    .join('');
  const numberParts = parts.filter(
    (part) => part.type !== 'currency' && part.type !== 'minusSign' && part.type !== 'plusSign'
  );

  // Drop the locale's spacing around the symbol, but keep any inside the number (e.g. "3,2 Tr")
  while (numberParts.length > 0 && isWhitespace(numberParts[0])) numberParts.shift();
  while (numberParts.length > 0 && isWhitespace(numberParts[numberParts.length - 1])) numberParts.pop();

  const number = numberParts.map((part) => part.value).join('');
  const gap = /^\p{L}+$/u.test(symbol) ? '\u00a0' : '';

  return position === 'after' ? `${sign}${number}${gap}${symbol}` : `${sign}${symbol}${gap}${number}`;
}

/**
 * Format money with the currency's symbol ("$", "€", "₫") rather than its code.
 * Pass `symbolPosition` to put the symbol before or after the number regardless of the locale.
 */
export function currencyFormat(
  value: number,
  currency: string = BASE_CURRENCY,
  options: Intl.NumberFormatOptions = {},
  symbolPosition?: SymbolPosition
): string {
  const formatter = Intl.NumberFormat([], {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    ...options
  });

  return symbolPosition ? placeSymbol(formatter.formatToParts(value), symbolPosition) : formatter.format(value);
}

/** Symbol for a currency, e.g. "$" for AUD or USD, "€", "₫" */
export function currencySymbol(currency: string = BASE_CURRENCY): string {
  return (
    Intl.NumberFormat([], { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency
  );
}

/** Short currency format for tight spaces, e.g. "$188", "$1.2K", "₫3.2M" */
export function compactCurrencyFormat(
  value: number,
  currency: string = BASE_CURRENCY,
  symbolPosition?: SymbolPosition
): string {
  return currencyFormat(value, currency, { notation: 'compact' }, symbolPosition);
}

/**
 * Total pay for the given billable minutes.
 * Returns `undefined` when the pay rate is missing or not a number (e.g. an empty input).
 */
export function totalFromPayRate(payRate: unknown, billableMinutes: number): number | undefined {
  if (payRate === undefined || payRate === null || String(payRate).trim() === '') return undefined;

  const rate = Number(payRate);
  if (!Number.isFinite(rate)) return undefined;

  return (rate * Math.max(0, billableMinutes)) / 60;
}

/** Round to the fewest decimal places (from 2 up to 10) that `isCloseEnough` accepts */
function roundToFewestDecimals(exact: number, isCloseEnough: (value: number) => boolean): number {
  for (let decimals = 2; decimals <= 10; decimals++) {
    const factor = 10 ** decimals;
    const value = Math.round(exact * factor) / factor;
    if (isCloseEnough(value)) return value;
  }

  return Math.round(exact * 1e10) / 1e10;
}

/** Decimal places a currency normally shows, e.g. 2 for AUD, 0 for VND and JPY */
export function currencyFractionDigits(currency: string = BASE_CURRENCY): number {
  return Intl.NumberFormat([], { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Well inside half of a currency's smallest unit, so amounts show the same however they get rounded */
export function currencyTolerance(currency: string = BASE_CURRENCY): number {
  return 10 ** -currencyFractionDigits(currency) / 20;
}

/**
 * Work out the pay rate (in the pay currency) from a total for the given billable minutes.
 * `total` can be in another currency: `rate` is how many of its units make 1 unit of the pay currency.
 * Uses the fewest decimal places that still give back the same total, so 187.50 over 7.5h gives 25
 * but 200 over 7h 20m gives 27.2727 (27.27 would only total 199.98).
 * Returns `undefined` when it can't be worked out (no billable time, negative or non-numeric total).
 */
export function payRateFromTotal(
  total: number,
  billableMinutes: number,
  rate: number = 1,
  tolerance: number = currencyTolerance()
): number | undefined {
  if (!Number.isFinite(total) || total < 0 || !(billableMinutes > 0) || !(rate > 0)) return undefined;

  const exactRate = (total * 60) / billableMinutes / rate;

  return roundToFewestDecimals(
    exactRate,
    (payRate) => Math.abs(totalFromPayRate(payRate, billableMinutes)! * rate - total) < tolerance
  );
}

/**
 * Turn an amount typed in another currency back into the pay currency,
 * keeping only as many decimals as needed for it to convert back to the same amount.
 */
export function amountFromConverted(
  amount: number,
  rate: number,
  tolerance: number = currencyTolerance()
): number | undefined {
  if (!Number.isFinite(amount) || amount < 0 || !(rate > 0)) return undefined;

  return roundToFewestDecimals(amount / rate, (value) => Math.abs(value * rate - amount) < tolerance);
}

export function toTimeStr(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    timeStyle: 'short'
  });
}

/**
 * [DEPRECATED] Avoid using this custom deepClone implementation as it may not handle all edge cases,
 * can be error-prone, and may have performance issues. Prefer using a well-tested library such as
 * lodash's _.cloneDeep for deep cloning objects. This function may be removed in future releases.
 */
export function deepClone<T>(obj: T, hash = new WeakMap()): T {
  // Handle null, undefined, and primitives
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (hash.has(obj)) {
    return hash.get(obj) as T;
  }

  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Handle Array
  if (Array.isArray(obj)) {
    const clonedArr: unknown[] = [];
    hash.set(obj, clonedArr);
    obj.forEach((item, index) => {
      clonedArr[index] = deepClone(item, hash);
    });
    return clonedArr as T;
  }

  // Handle Map
  if (obj instanceof Map) {
    const clonedMap = new Map();
    hash.set(obj, clonedMap);
    obj.forEach((value, key) => {
      clonedMap.set(key, deepClone(value, hash));
    });
    return clonedMap as T;
  }

  // Handle Set
  if (obj instanceof Set) {
    const clonedSet = new Set();
    hash.set(obj, clonedSet);
    obj.forEach((value) => {
      clonedSet.add(deepClone(value, hash));
    });
    return clonedSet as T;
  }

  // Handle Object (including objects created with custom constructors)
  const clonedObj = Object.create(Object.getPrototypeOf(obj));
  hash.set(obj, clonedObj);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone(obj[key], hash);
    }
  }

  return clonedObj as T;
}

/**
 * Executes a function while managing a store's `status` lifecycle.
 * - Sets `status` to `Loading` before running
 * - Sets `status` to `Error` and rethrows on failure
 * - Sets `status` back to `Ready` in `finally` (unless already `Error`)
 */
export async function withStatus<T>(store: { status: Status }, executor: () => Promise<T> | T): Promise<T> {
  store.status = STATUS.Loading;
  try {
    const result = await Promise.resolve(executor());
    return result;
  } catch (error) {
    store.status = STATUS.Error;
    throw error;
  } finally {
    if (store.status !== STATUS.Error) {
      store.status = STATUS.Ready;
    }
  }
}
