import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import api from '@/api';
import WorkInfo from '@/models/WorkInfo';
import { useWorkInfosStore } from '@/stores/workInfosStore';

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }));
vi.mock('@/api', () => ({
  default: {
    workInfos: {
      fetch: vi.fn(),
      createOrUpdate: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}));

function details() {
  return new WorkInfo({
    id: 'work-1',
    workplace: 'Hospital',
    profiles: [
      {
        id: 'b15ba783-78a0-4d72-9946-b95821c65361',
        position: 'Nurse',
        location: 'Ward A',
        payRates: [
          { id: '90ed6576-624f-4c14-8648-4d71b359c7a6', name: 'Weekend', hourlyRate: 30 },
          { id: '4c9a2f60-2fa4-4782-bc83-51bb9781dba2', name: 'Holiday', hourlyRate: 30 }
        ]
      }
    ]
  });
}

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  auth.isAuthenticated = false;
  vi.clearAllMocks();
  vi.mocked(api.workInfos.createOrUpdate).mockImplementation(async (info) => info.toDTO());
  vi.mocked(api.workInfos.update).mockImplementation(async (info) => info.toDTO());
});

afterEach(() => {
  disposePinia(pinia);
  vi.unstubAllGlobals();
});

describe('workInfosStore', () => {
  it('fetches legacy local maps and round trips complete new metadata', async () => {
    const store = useWorkInfosStore();
    localStorage.setItem('prevWorkInfos', JSON.stringify({ Cafe: { payRate: 0 } }));
    await store.fetch();
    expect(store.workInfos.get('Cafe')?.payRates).toEqual(new Set([0]));
    expect(localStorage.getItem('prevWorkInfos')).toBeNull();
    store.enableAutoPersist();
    await store.save(details());
    await nextTick();
    const saved = JSON.parse(localStorage.getItem('workInfos')!);
    expect(saved.find((info: { workplace: string }) => info.workplace === 'Hospital')).toEqual(details().toDTO());
    store.workInfos.clear();
    await store.fetch();
    expect(store.workInfos.get('Hospital')?.toDTO()).toEqual(details().toDTO());
  });

  it('loads numeric and array-valued legacy local workplace maps without dropping rates', async () => {
    localStorage.setItem('prevWorkInfos', JSON.stringify({ Cafe: [20, 25], Shop: 0 }));
    const store = useWorkInfosStore();
    await store.fetch();
    expect(store.workInfos.get('Cafe')?.payRates).toEqual(new Set([20, 25]));
    expect(store.workInfos.get('Shop')?.payRates).toEqual(new Set([0]));
  });

  it('remembers custom amounts only within the selected profile', async () => {
    const store = useWorkInfosStore();
    await store.save(details());
    const profileId = details().profiles[0].id;
    await store.add('Hospital', 30, profileId);
    expect(store.workInfos.get('Hospital')?.profiles[0].payRates).toHaveLength(2);
    await store.add('Hospital', 35, profileId);
    expect(store.workInfos.get('Hospital')?.profiles[0].payRates[2]).toEqual({
      id: 'legacy-35',
      name: '',
      hourlyRate: 35
    });
    expect(store.workInfos.get('Hospital')?.profiles[0]).toMatchObject({ position: 'Nurse', location: 'Ward A' });
    await expect(store.add('Hospital', 35, 'unknown')).resolves.toBeUndefined();
  });

  it('skips remembering stale profile snapshots without changing details or calling the API', async () => {
    const store = useWorkInfosStore();
    await store.save(details());
    const before = store.workInfos.get('Hospital')!.toDTO();
    auth.isAuthenticated = true;
    await expect(store.add('Hospital', 40, 'deleted-profile')).resolves.toBeUndefined();
    await expect(store.add('Deleted workplace', 40, 'deleted-profile')).resolves.toBeUndefined();
    expect(store.workInfos.get('Hospital')!.toDTO()).toEqual(before);
    expect(store.workInfos.has('Deleted workplace')).toBe(false);
    expect(api.workInfos.createOrUpdate).not.toHaveBeenCalled();
    expect(api.workInfos.update).not.toHaveBeenCalled();
  });

  it('keeps unique IDs when remembering an amount whose legacy ID was edited to another amount', async () => {
    const store = useWorkInfosStore();
    const info = WorkInfo.parse({ workplace: 'Cafe', payRates: [25] });
    info.profiles[0].payRates[0].hourlyRate = 28;
    await store.save(info);
    await store.add('Cafe', 25);
    const saved = store.workInfos.get('Cafe')!;
    const rates = saved.profiles[0].payRates;
    expect(rates[0]).toEqual({ id: 'legacy-25', name: '', hourlyRate: 28 });
    expect(rates[1]).toMatchObject({ name: 'Custom', hourlyRate: 25 });
    expect(rates[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(rates.map((rate) => rate.id)).size).toBe(2);
    expect(WorkInfo.parse(saved.toDTO()).toDTO()).toEqual(saved.toDTO());
  });

  it('uses PUT for explicit edits and POST for new/merged details', async () => {
    auth.isAuthenticated = true;
    const store = useWorkInfosStore();
    await store.save(details());
    expect(api.workInfos.createOrUpdate).toHaveBeenCalledTimes(1);
    const edited = details();
    edited.profiles[0].payRates = [];
    await store.save(edited);
    expect(api.workInfos.update).toHaveBeenCalledTimes(1);
    expect(store.workInfos.get('Hospital')?.profiles[0].payRates).toEqual([]);
    await store.merge(details());
    expect(api.workInfos.createOrUpdate).toHaveBeenCalledTimes(2);
  });

  it('keeps all operations local while account sync is pending', async () => {
    auth.isAuthenticated = true;
    localStorage.setItem('syncPending', 'true');
    localStorage.setItem('workInfos', JSON.stringify([details().toDTO()]));
    const store = useWorkInfosStore();
    await store.fetch();
    await store.save(details());
    await store.merge(details());
    await store.add('Hospital', 22);
    await store.delete('Hospital', 22);
    expect(api.workInfos.fetch).not.toHaveBeenCalled();
    expect(api.workInfos.createOrUpdate).not.toHaveBeenCalled();
    expect(api.workInfos.update).not.toHaveBeenCalled();
    expect(api.workInfos.delete).not.toHaveBeenCalled();
  });

  it('merges imports without overwriting existing matching IDs or losing distinct equal rates', async () => {
    const store = useWorkInfosStore();
    await store.save(details());
    const imported = details();
    imported.id = 'different-import-id';
    imported.profiles[0].position = 'Changed';
    imported.profiles[0].payRates[0].hourlyRate = 100;
    imported.profiles[0].payRates.push({
      id: 'b904a78d-5d6a-419d-8648-aa54ea631ae2',
      name: 'Overnight',
      hourlyRate: 30
    });
    imported.profiles.push({ id: 'c9a254df-f26b-42bf-af95-95bd91045a6d', position: 'Supervisor', payRates: [] });
    await store.merge(imported);
    const result = store.workInfos.get('Hospital')!;
    expect(result.id).toBe('work-1');
    expect(result.profiles[0].position).toBe('Nurse');
    expect(result.profiles[0].payRates.map((rate) => rate.hourlyRate)).toEqual([30, 30, 30]);
    expect(result.profiles).toHaveLength(2);
  });

  it('does not mutate the store if an explicit server update fails', async () => {
    const store = useWorkInfosStore();
    await store.save(details());
    auth.isAuthenticated = true;
    vi.mocked(api.workInfos.update).mockRejectedValueOnce(new Error('Offline'));
    const edited = details();
    edited.profiles[0].location = 'Ward B';
    await expect(store.save(edited)).rejects.toThrow('Offline');
    expect(store.workInfos.get('Hospital')?.profiles[0].location).toBe('Ward A');
  });

  it('rejects accidental workplace renames and duplicate workplace identities', async () => {
    const store = useWorkInfosStore();
    await store.save(details());
    const renamed = details();
    renamed.workplace = 'Other';
    await expect(store.save(renamed)).rejects.toThrow('cannot be changed');
    const duplicate = details();
    duplicate.id = 'other-id';
    await expect(store.save(duplicate)).rejects.toThrow('already exists');
  });

  it('legacy amount deletion preserves equal named rates and all profile metadata', async () => {
    const store = useWorkInfosStore();
    await store.save(details());
    await store.add('Hospital', 30);
    await store.add('Hospital', 35, details().profiles[0].id);
    await store.delete('Hospital', 35);
    await store.delete('Hospital', 30);
    const info = store.workInfos.get('Hospital')!;
    expect(info.profiles[0].payRates).toHaveLength(2);
    expect(info.profiles.find((profile) => profile.id === 'legacy')?.payRates).toEqual([]);
    expect(info.profiles[0].location).toBe('Ward A');
  });

  it('removes an unnamed migrated rate after its amount was edited, preserving named matches', async () => {
    const store = useWorkInfosStore();
    const info = details();
    info.profiles[0].payRates.push({ id: 'legacy-25', name: '', hourlyRate: 30 });
    await store.save(info);
    await store.delete('Hospital', 30);
    expect(store.workInfos.get('Hospital')?.profiles[0].payRates).toHaveLength(2);
  });
});
