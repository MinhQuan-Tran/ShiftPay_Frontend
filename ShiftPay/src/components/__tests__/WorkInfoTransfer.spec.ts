import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ImportDataDialog from '@/components/ImportDataDialog.vue';
import SyncDataDialog from '@/components/SyncDataDialog.vue';
import WorkInfo from '@/models/WorkInfo';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import api from '@/api';

const workInfoData = {
  id: 'work-1',
  workplace: 'Cafe',
  profiles: [
    {
      id: 'profile-1',
      position: 'Supervisor',
      location: 'City',
      payRates: [
        { id: 'weekend', name: 'Weekend', hourlyRate: 30 },
        { id: 'overnight', name: 'Overnight', hourlyRate: 30 }
      ]
    },
    { id: 'profile-2', position: 'Barista', location: 'Airport', payRates: [] }
  ]
};

const dialogStub = {
  template: '<div><slot /></div>',
  methods: { close() {} }
};

beforeEach(() => {
  vi.restoreAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear()
  });
  setActivePinia(createPinia());
});

afterEach(() => vi.unstubAllGlobals());

describe('WorkInfo backup transfer', () => {
  it.each(['storage export', 'raw array', 'raw map'])('imports complete profiles from a %s', async (format) => {
    const wrapper = mount(ImportDataDialog, { global: { stubs: { BaseDialog: dialogStub } } });
    const workInfos = format === 'storage export'
      ? JSON.stringify([workInfoData])
      : format === 'raw array' ? [workInfoData] : { Cafe: workInfoData };
    wrapper.vm.parseData({ workInfos });

    expect(wrapper.vm.parsedData?.workInfoErrors).toEqual([]);
    await wrapper.vm.confirmImport();

    const restored = useWorkInfosStore().workInfos.get('Cafe');
    expect(restored?.toDTO().profiles).toEqual(workInfoData.profiles);
    expect(wrapper.vm.step).toBe('complete');
    wrapper.unmount();
  });

  it.each([
    { Cafe: { payRate: 25 } },
    { Cafe: [25] },
    { Cafe: 25 }
  ])('accepts older workplace maps and singular pay rates: %j', async (workInfos) => {
    const wrapper = mount(ImportDataDialog, { global: { stubs: { BaseDialog: dialogStub } } });
    wrapper.vm.parseData({ prevWorkInfos: JSON.stringify(workInfos) });

    expect(wrapper.vm.parsedData?.workInfoErrors).toEqual([]);
    await wrapper.vm.confirmImport();

    expect([...useWorkInfosStore().workInfos.get('Cafe')!.payRates]).toEqual([25]);
    wrapper.unmount();
  });

  it('uploads every full profile, including workplaces without a pay rate', async () => {
    const store = useWorkInfosStore();
    store.workInfos.set('Cafe', WorkInfo.parse(workInfoData));
    store.workInfos.set('Library', WorkInfo.parse({
      workplace: 'Library',
      profiles: [{ id: 'volunteer', position: 'Volunteer', payRates: [] }]
    }));
    localStorage.setItem('syncPending', 'true');
    const upload = vi.spyOn(api.workInfos, 'createOrUpdate').mockResolvedValue(null);
    const wrapper = mount(SyncDataDialog, { global: { stubs: { BaseDialog: dialogStub } } });

    await wrapper.vm.uploadLocalData();

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0].toDTO().profiles).toEqual(workInfoData.profiles);
    expect(upload.mock.calls[1][0].toDTO().profiles[0].position).toBe('Volunteer');
    expect(wrapper.vm.error).toBeNull();
    expect(localStorage.getItem('syncPending')).toBeNull();
    wrapper.unmount();
  });
});
