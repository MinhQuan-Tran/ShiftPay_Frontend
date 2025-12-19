import { STATUS, type Status } from '@/types';

export function currencyFormat(value: number): string {
  return Intl.NumberFormat([], {
    style: 'currency',
    currency: 'AUD'
  }).format(value);
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
    const clonedArr: any[] = [];
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
  const clonedObj: any = Object.create(Object.getPrototypeOf(obj));
  hash.set(obj, clonedObj);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone((obj as any)[key], hash);
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
  } catch (error: any) {
    store.status = STATUS.Error;
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    if (store.status !== STATUS.Error) {
      store.status = STATUS.Ready;
    }
  }
}
