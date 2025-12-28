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

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API ${options.method} ${url} failed: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const contentType = res.headers.get('Content-Type');
    return contentType?.includes('application/json') ? await res.json() : null;
  } catch (err) {
    console.error(`[API Error] ${options.method} ${url}`, err);
    throw err;
  }
}

export const api = {
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
    async fetch() {
      return createRequest('workInfos', { method: 'GET' });
    },

    async create(workplace: string, payRates: number[]) {
      return createRequest('workInfos', { method: 'POST', body: { workplace, payRates } });
    },

    // No update

    async delete(workplace: string, payRate?: number) {
      const queryParams: QueryParams = { workplace };

      if (payRate !== undefined) queryParams.payRate = payRate;

      return createRequest(`workInfos/${workplace}`, { method: 'DELETE', queryParams });
    }
  }

  // shiftTemplates: {
  //   async fetch() {
  //     return createRequest('shiftTemplates', { method: 'GET' });
  //   },

  //   async create(shift: Shift) {
  //     return createRequest('shiftTemplates', { method: 'POST', body: shift.toDTO() });
  //   },

  //   async delete(id: string) {
  //     return createRequest(`shiftTemplates/${id}`, { method: 'DELETE' });
  //   }
  // }
};
