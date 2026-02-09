import { useAuthStore } from '@/stores/authStore';
import type Shift from './models/Shift';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type ApiResource =
  | 'shifts'
  | `shifts/${string}`
  | 'summary'
  | 'workInfos'
  | `workInfos/${string}`
  | 'shiftTemplates'
  | `shiftTemplates/${string}`;
type QueryParams = Record<string, string | number | boolean>;

interface RequestOptions {
  method: HttpMethod;
  body?: any;
  queryParams?: QueryParams;
}

// Track pending write operations (POST, PUT, DELETE)
let pendingWriteCount = 0;

/** Returns true if there are pending write operations */
export function hasPendingWrites(): boolean {
  return pendingWriteCount > 0;
}

/** Initialize beforeunload warning for pending API writes */
export function initBeforeUnloadWarning(): void {
  window.addEventListener('beforeunload', (e) => {
    if (hasPendingWrites()) {
      e.preventDefault();
    }
  });
}

function buildUrl(resource: ApiResource, queryParams?: QueryParams): string {
  const baseUrl = `${import.meta.env.VITE_API_URL}/api/${resource}`;
  if (!queryParams) return baseUrl;

  const searchParams = new URLSearchParams();
  for (const key in queryParams) {
    const value = queryParams[key];
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  return `${baseUrl}?${searchParams.toString()}`;
}

async function createRequest(resource: ApiResource, options: RequestOptions) {
  const authStore = useAuthStore();
  const token = await authStore.fetchToken();

  const url = buildUrl(resource, options.queryParams);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  // Track write operations
  const isWriteOperation = options.method !== 'GET';
  if (isWriteOperation) pendingWriteCount++;

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    // Handle HTTP errors (4xx, 5xx)
    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status} ${res.statusText}: ${errorText}`);
    }

    // Parse JSON response if applicable
    const contentType = res.headers.get('Content-Type');
    return contentType?.includes('application/json') ? await res.json() : null;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Network error: Please check your internet connection');
    }
    throw err instanceof Error ? err : new Error('API request failed: ' + String(err));
  } finally {
    if (isWriteOperation) pendingWriteCount--;
  }
}

const api = {
  shifts: {
    async fetch(id?: string, params?: QueryParams) {
      return createRequest(`shifts/${id ?? ''}`, { method: 'GET', queryParams: params });
    },

    async create(shift: Shift) {
      return createRequest('shifts', { method: 'POST', body: shift.toDTO() });
    },

    async createBatch(shifts: Shift[]) {
      return createRequest('shifts/batch', { method: 'POST', body: shifts.map((shift) => shift.toDTO()) });
    },

    async update(id: string, shift: Shift) {
      return createRequest(`shifts/${id}`, { method: 'PUT', body: shift.toDTO() });
    },

    async delete(input: string | string[] | undefined) {
      // Delete single shift by ID
      if (typeof input === 'string') {
        return createRequest(`shifts/${input}`, { method: 'DELETE' });
      }

      // Delete multiple shifts by IDs
      if (Array.isArray(input)) {
        return createRequest('shifts', { method: 'DELETE', body: { ids: input } });
      }

      // Delete all shifts
      return createRequest('shifts', { method: 'DELETE' });
    }
  },

  // summary: {
  //   async fetch(arg?: QueryParams) {
  //     return createRequest('summary', { method: 'GET', queryParams: arg });
  //   }
  // },

  workInfos: {
    async fetch(id?: string) {
      return createRequest(`workInfos/${id ?? ''}`, { method: 'GET' });
    },

    /**
     * Create or update a work info (upsert by id if provided).
     * If id is provided and exists, updates (merges payRates); otherwise creates.
     */
    async createOrUpdate(workplace: string, payRates: number[], id?: string) {
      return createRequest('workInfos', {
        method: 'POST',
        body: { id, workplace, payRates }
      });
    },

    /**
     * Delete a work info by ID, or remove a specific pay rate.
     * @param id - The work info ID
     * @param payRate - Optional: if provided, only removes this pay rate from the list
     */
    async delete(id: string, payRate?: number) {
      const queryParams: QueryParams | undefined = payRate !== undefined ? { payRate } : undefined;
      return createRequest(`workInfos/${encodeURIComponent(id)}`, { method: 'DELETE', queryParams });
    }
  },

  shiftTemplates: {
    async fetch(id?: string) {
      return createRequest(`shiftTemplates/${id ?? ''}`, { method: 'GET' });
    },

    /**
     * Create or update a shift template (upsert by templateName).
     * If a template with the same templateName exists, it updates; otherwise creates.
     */
    async createOrUpdate(templateName: string, shift: Shift, id?: string) {
      return createRequest('shiftTemplates', {
        method: 'POST',
        body: { id, templateName, ...shift.toDTO() }
      });
    },

    async delete(id: string) {
      return createRequest(`shiftTemplates/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
  }
};

export default api;
