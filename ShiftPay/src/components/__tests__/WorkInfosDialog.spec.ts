import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import WorkInfosDialog from '@/components/WorkInfosDialog.vue';
import WorkInfo from '@/models/WorkInfo';
import { useWorkInfosStore } from '@/stores/workInfosStore';

vi.mock('@/api', () => ({ default: {} }));

const wrappers: Array<{ unmount: () => void }> = [];

async function mountEditor(info: WorkInfo) {
  useWorkInfosStore().workInfos.set(info.workplace, info);
  const wrapper = mount(WorkInfosDialog, {
    global: {
      plugins: [getActivePinia()!],
      stubs: {
        BaseDialog: { template: '<section><slot /></section>' }
      }
    }
  });
  wrappers.push(wrapper);
  wrapper.vm.loadWorkplace(info.workplace);
  await nextTick();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  });
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WorkInfosDialog', () => {
  it('edits an unnamed legacy rate without requiring a name or changing its identity', async () => {
    const wrapper = await mountEditor(WorkInfo.parse({ id: 'cafe', workplace: 'Cafe', payRates: [25] }));
    const name = wrapper.get<HTMLInputElement>('input[aria-label="Profile 1 rate 1 name"]');
    const amount = wrapper.get<HTMLInputElement>('input[aria-label="Profile 1 rate 1 hourly rate"]');

    await amount.setValue(28);

    expect(name.element.required).toBe(false);
    expect(name.element.value).toBe('');
    expect(wrapper.text()).toContain('Rate name (optional)');

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe('Work details saved.');
    expect(useWorkInfosStore().workInfos.get('Cafe')!.profiles[0]!.payRates[0]).toEqual({
      id: 'legacy-25',
      name: '',
      hourlyRate: 28
    });
  });

  it('renders unique rate input IDs when two profiles contain the same scoped rate ID', async () => {
    const wrapper = await mountEditor(WorkInfo.parse({
      id: 'cafe',
      workplace: 'Cafe',
      profiles: [
        { id: 'city', location: 'City', payRates: [{ id: 'legacy-25', name: '', hourlyRate: 25 }] },
        { id: 'airport', location: 'Airport', payRates: [{ id: 'legacy-25', name: '', hourlyRate: 25 }] }
      ]
    }));

    const rateIds = wrapper.findAll('input[id^="rate-"]').map((input) => input.attributes('id'));

    expect(rateIds).toHaveLength(4);
    expect(new Set(rateIds).size).toBe(rateIds.length);
    expect(wrapper.get('input[aria-label="Profile 1 rate 1 name"]').attributes('id'))
      .not.toBe(wrapper.get('input[aria-label="Profile 2 rate 1 name"]').attributes('id'));
  });
});
