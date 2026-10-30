import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ShiftDialog from '@/components/ShiftDialog.vue';
import Shift from '@/models/Shift';
import WorkInfo from '@/models/WorkInfo';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useShiftsStore } from '@/stores/shiftsStore';

vi.mock('@/api', () => ({ default: {} }));

const SNAPSHOT = {
  workProfileId: 'barista-city',
  payRateId: 'overnight',
  position: 'Barista',
  location: 'City',
  payRateName: 'Overnight'
};

const SHIFT = {
  id: 'saved-shift',
  workplace: 'Cafe',
  payRate: 30,
  startTime: new Date('2026-10-01T20:00:00Z'),
  endTime: new Date('2026-10-02T04:00:00Z'),
  ...SNAPSHOT
};

function rememberCafe() {
  const workInfo = WorkInfo.parse({
    id: 'cafe',
    workplace: 'Cafe',
    profiles: [
      {
        id: 'barista-city',
        position: 'Barista',
        location: 'City',
        payRates: [
          { id: 'overnight', name: 'Overnight', hourlyRate: 30 },
          { id: 'weekend', name: 'Weekend', hourlyRate: 30 }
        ]
      },
      {
        id: 'manager-airport',
        position: 'Manager',
        location: 'Airport',
        payRates: [
          { id: 'standard', name: 'Standard', hourlyRate: 35 },
          { id: 'holiday', name: 'Holiday', hourlyRate: 50 }
        ]
      }
    ]
  });
  useWorkInfosStore().workInfos.set(workInfo.workplace, workInfo);
}

const wrappers: Array<{ unmount: () => void }> = [];

function mountDialog(shift: Partial<Shift> = {}, action = 'add') {
  const wrapper = mount(ShiftDialog, {
    props: {
      selectedDate: new Date('2026-10-15T00:00:00Z'),
      action,
      shift
    },
    global: {
      plugins: [getActivePinia()!],
      stubs: {
        BaseDialog: { template: '<section><slot /></section>' },
        ComboBox: { template: '<div><slot /></div>' },
        ButtonConfirm: { template: '<button type="button"><slot /></button>' },
        WorkInfosDialog: true
      }
    }
  });
  wrappers.push(wrapper);
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

describe('ShiftDialog work profiles', () => {
  it('distinguishes named rates with the same hourly amount', async () => {
    rememberCafe();
    const wrapper = mountDialog();

    wrapper.vm.changeWorkplace('Cafe');
    wrapper.vm.selectProfile('barista-city');
    wrapper.vm.selectPayRate('overnight');
    await nextTick();

    expect(wrapper.vm.formData).toMatchObject({ payRate: 30, ...SNAPSHOT });

    wrapper.vm.selectPayRate('weekend');
    await nextTick();

    expect(wrapper.vm.formData).toMatchObject({
      payRate: 30,
      payRateId: 'weekend',
      payRateName: 'Weekend'
    });
  });

  it('clears a previous rate when selecting another position and location', async () => {
    rememberCafe();
    const wrapper = mountDialog(new Shift(SHIFT), 'edit');

    wrapper.vm.selectProfile('manager-airport');
    await nextTick();

    expect(wrapper.vm.formData).toMatchObject({
      workProfileId: 'manager-airport',
      position: 'Manager',
      location: 'Airport'
    });
    expect(wrapper.vm.formData.payRateId).toBeUndefined();
    expect(wrapper.vm.formData.payRateName).toBeUndefined();
    expect(wrapper.vm.formData.payRate).toBeUndefined();
  });

  it('clears profile and named rate details when changing to a new workplace', async () => {
    rememberCafe();
    const wrapper = mountDialog(new Shift(SHIFT), 'edit');

    wrapper.vm.changeWorkplace('New workplace');
    await nextTick();

    expect(wrapper.vm.formData.workplace).toBe('New workplace');
    for (const key of ['workProfileId', 'payRateId', 'position', 'location', 'payRateName', 'payRate'] as const) {
      expect(wrapper.vm.formData[key]).toBeUndefined();
    }
  });

  it('preserves historical values after the source profile changes or is deleted', async () => {
    rememberCafe();
    const store = useWorkInfosStore();
    const profile = store.workInfos.get('Cafe')!.profiles[0]!;
    profile.position = 'Senior barista';
    profile.payRates[0]!.hourlyRate = 45;
    const wrapper = mountDialog(new Shift(SHIFT), 'edit');
    await nextTick();

    expect(wrapper.vm.formData).toMatchObject({ payRate: 30, ...SNAPSHOT });

    store.workInfos.delete('Cafe');
    await nextTick();
    const saved = wrapper.vm.parseFormData();

    expect(saved).toMatchObject({ payRate: 30, ...SNAPSHOT });
    expect(saved.income).toBe(240);
  });

  it('clears the saved rate identity when entering a custom amount', async () => {
    rememberCafe();
    const wrapper = mountDialog(new Shift(SHIFT), 'edit');

    wrapper.vm.formData.payRate = 32;
    wrapper.vm.customRateChanged();
    await nextTick();

    expect(wrapper.vm.formData).toMatchObject({
      workProfileId: 'barista-city',
      position: 'Barista',
      location: 'City',
      payRate: 32
    });
    expect(wrapper.vm.formData.payRateId).toBeUndefined();
    expect(wrapper.vm.formData.payRateName).toBeUndefined();
  });

  it('preserves template snapshots when applying or quickly adding a template', async () => {
    const template = new Shift(SHIFT);
    useShiftTemplatesStore().templates.set('Night shift', {
      id: 'night-template',
      templateName: 'Night shift',
      shift: template
    });
    const add = vi.spyOn(useShiftsStore(), 'add').mockResolvedValue(undefined);
    const wrapper = mountDialog();

    wrapper.vm.applyTemplate('Night shift');
    await nextTick();
    const parsed = wrapper.vm.parseFormData();

    expect(parsed).toMatchObject({ payRate: 30, ...SNAPSHOT });
    expect(parsed.startTime.toDateString()).toBe(new Date('2026-10-15T00:00:00Z').toDateString());

    await wrapper.vm.quickAddShift(template);

    expect(add).toHaveBeenCalledOnce();
    const created = add.mock.calls[0]![0] as Shift;
    expect(created).toMatchObject({ payRate: 30, ...SNAPSHOT });
    expect(created.id).not.toBe(template.id);
  });
});
