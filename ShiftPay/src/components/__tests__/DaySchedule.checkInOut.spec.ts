import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

import DaySchedule from '@/components/DaySchedule.vue';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';
import { useShiftsStore } from '@/stores/shiftsStore';

// jsdom doesn't fully implement <dialog>; give it the bits the app uses.
function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
}

// Shift cards aren't under test (and use Intl.DurationFormat, missing in some Node versions)
const stubs = { DayScheduleShiftCard: true };

function todayRange() {
  const start = new Date(new Date().setHours(0, 0, 0, 0));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

describe('DaySchedule — Start/End Shift (check in/out)', () => {
  let pinia: Pinia;

  beforeEach(() => {
    polyfillDialog();
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Only fake Date so Vue's scheduler and component timeouts still run normally.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 28, 9, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears the session and shows "Start Shift" again after clocking out', async () => {
    const wrapper = mount(DaySchedule, {
      props: { selectedRange: todayRange() },
      global: { plugins: [pinia], stubs },
      attachTo: document.body
    });
    const session = useShiftSessionStore();
    const shifts = useShiftsStore();

    const checkInOutBtn = () => wrapper.get('#check-in-out-btn');
    expect(checkInOutBtn().text()).toBe('Start Shift');

    // 1. Start Shift
    await checkInOutBtn().trigger('click');
    expect(session.isInProgress).toBe(true);
    expect(checkInOutBtn().text()).toBe('End Shift');

    // 2. Later, End Shift -> Check Out dialog opens with times filled in
    vi.setSystemTime(new Date(2026, 10, 28, 13, 30));
    await checkInOutBtn().trigger('click');
    await flushPromises();

    const startInput = wrapper.get<HTMLInputElement>('#start-time');
    const endInput = wrapper.get<HTMLInputElement>('#end-time');
    expect(startInput.element.value).toBe('2026-11-28T09:00');
    expect(endInput.element.value).toBe('2026-11-28T13:30');

    // 3. Enter workplace and pay rate, then submit with the dialog's primary button
    await wrapper.get('#workplace').setValue('McDonalds');
    await wrapper.get('#pay-rate').setValue('25.5');

    const submitBtn = wrapper.get<HTMLButtonElement>('#add-shift-btn');
    // Submit the way a real click does, so event.submitter is the button
    submitBtn.element.form!.requestSubmit(submitBtn.element);
    await flushPromises();

    // Shift saved
    expect(shifts.shifts).toHaveLength(1);
    expect(shifts.shifts[0].workplace).toBe('McDonalds');
    expect(shifts.shifts[0].payRate).toBe(25.5);

    // Session cleared and button back to Start Shift
    expect(session.startTime).toBeUndefined();
    expect(session.isInProgress).toBe(false);
    expect(checkInOutBtn().text()).toBe('Start Shift');

    wrapper.unmount();
  });

  it('keeps the "Add Shift" label in check in/out mode', async () => {
    const wrapper = mount(DaySchedule, {
      props: { selectedRange: todayRange() },
      global: { plugins: [pinia], stubs },
      attachTo: document.body
    });

    await wrapper.get('#check-in-out-btn').trigger('click');
    vi.setSystemTime(new Date(2026, 10, 28, 13, 30));
    await wrapper.get('#check-in-out-btn').trigger('click');
    await flushPromises();

    expect(wrapper.get('#add-shift-btn').text()).toBe('Add Shift');

    wrapper.unmount();
  });
});
