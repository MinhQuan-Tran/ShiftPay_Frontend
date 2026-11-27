import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

import api from '@/api';
import WorkInfo from '@/models/WorkInfo';
import SyncDataDialog from '@/components/SyncDataDialog.vue';
import { useWorkInfosStore } from '@/stores/workInfosStore';

describe('SyncDataDialog — upload local data', () => {
  let pinia: Pinia;

  beforeEach(() => {
    const proto = HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>;
    if (typeof proto.showModal !== 'function') proto.showModal = function () {};
    if (typeof proto.close !== 'function') proto.close = function () {};

    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads each local workplace as a WorkInfo and completes', async () => {
    const createOrUpdate = vi.spyOn(api.workInfos, 'createOrUpdate').mockResolvedValue({});

    const workInfos = useWorkInfosStore();
    workInfos.workInfos.set(
      'McDonalds',
      new WorkInfo({ id: 'w1', workplace: 'McDonalds', payRates: new Set([25.5, 30]) })
    );

    localStorage.setItem('syncPending', 'true');

    const wrapper = mount(SyncDataDialog, { global: { plugins: [pinia] } });
    await (wrapper.vm as unknown as { uploadLocalData: () => Promise<void> }).uploadLocalData();
    await flushPromises();

    expect(createOrUpdate).toHaveBeenCalledTimes(1);
    const sent = createOrUpdate.mock.calls[0][0];
    expect(sent).toBeInstanceOf(WorkInfo);
    expect(sent.toDTO()).toEqual({ id: 'w1', workplace: 'McDonalds', payRates: [25.5, 30] });

    // Success path: no error shown, pending flag cleared, parent told to refetch
    expect((wrapper.vm as unknown as { error: string | null }).error).toBeNull();
    expect(localStorage.getItem('syncPending')).toBeNull();
    expect(wrapper.emitted('complete')).toHaveLength(1);

    wrapper.unmount();
  });
});
