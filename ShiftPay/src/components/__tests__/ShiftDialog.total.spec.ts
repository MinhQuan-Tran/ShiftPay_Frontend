import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

import ShiftDialog from '@/components/ShiftDialog.vue';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import WorkInfo from '@/models/WorkInfo';
import { currencyFormat, currencySymbol } from '@/utils';

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

// Intl.DurationFormat is missing in some Node versions; the label text isn't under test.
function polyfillDurationFormat() {
  const intl = Intl as unknown as Record<string, unknown>;
  if (typeof intl.DurationFormat !== 'function') {
    intl.DurationFormat = class {
      format(d: { hours: number; minutes: number }) {
        return `${d.hours}h ${d.minutes}m`;
      }
    };
  }
}

function mountDialog(pinia: Pinia, shift: Record<string, unknown>, action = 'add') {
  return mount(ShiftDialog, {
    props: { selectedDate: new Date(2026, 10, 28), action, shift },
    global: { plugins: [pinia] },
    attachTo: document.body
  });
}

describe('ShiftDialog — Total field', () => {
  let pinia: Pinia;

  beforeEach(() => {
    polyfillDialog();
    polyfillDurationFormat();
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sevenHoursTwenty = {
    startTime: new Date(2026, 10, 28, 9, 0),
    endTime: new Date(2026, 10, 28, 16, 20)
  };

  it('sits after Unpaid Breaks, with the currency symbol before the box', async () => {
    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });
    await flushPromises(); // let the combo boxes finish setting up before unmounting

    const sections = wrapper.findAll('form > .form-section').map((section) => section.attributes('id'));
    expect(sections.indexOf('total')).toBe(sections.indexOf('unpaid-breaks') + 1);

    const moneyInput = wrapper.get('#total .money-input');
    expect(moneyInput.element.firstElementChild!.classList.contains('currency-symbol')).toBe(true);
    expect(moneyInput.get('.currency-symbol').text()).toBe(currencySymbol('AUD'));
    expect(moneyInput.get('input').attributes('id')).toBe('total-pay');

    // Pay Rate gets the same symbol in front of its box
    const payRateInput = wrapper.get('#pay-rate');
    const payRateBox = payRateInput.element.parentElement!;
    expect(payRateBox.classList.contains('money-input')).toBe(true);
    expect(payRateBox.firstElementChild!.textContent).toBe(currencySymbol('AUD'));

    wrapper.unmount();
  });

  it('puts the symbol after the amount when chosen', async () => {
    useCurrencyStore().setSymbolPosition('after');
    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });
    await flushPromises();

    expect(wrapper.get('#pay-rate').element.parentElement!.classList.contains('symbol-after')).toBe(true);
    expect(wrapper.get('#total .money-input').classes()).toContain('symbol-after');

    wrapper.unmount();
  });

  it('shows pay rate × billable hours', async () => {
    const wrapper = mountDialog(pinia, {
      startTime: new Date(2026, 10, 28, 9, 0),
      endTime: new Date(2026, 10, 28, 16, 30)
    });

    await wrapper.get('#pay-rate').setValue('25');
    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('187.50');

    // Unpaid breaks reduce the total
    await wrapper.get('#unpaid-breaks .add-item-btn').trigger('click');
    await wrapper.get('input[name="unpaidBreak-minutes"]').setValue('30');
    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('175.00');
    expect(wrapper.get('.total-breakdown').text()).toBe(`7h 0m after unpaid breaks × ${currencyFormat(25, 'AUD')}/h`);

    wrapper.unmount();
  });

  it('works out the pay rate from a typed total and saves it', async () => {
    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });
    const total = wrapper.get<HTMLInputElement>('#total-pay');

    await wrapper.get('#workplace').setValue('Cafe');
    await total.setValue('200');

    expect(wrapper.get<HTMLInputElement>('#pay-rate').element.value).toBe('27.2727');
    // Keeps what the user typed while editing, then shows the recalculated total
    expect(total.element.value).toBe('200');
    await total.trigger('blur');
    expect(total.element.value).toBe('200.00');

    const submitBtn = wrapper.get<HTMLButtonElement>('#add-shift-btn');
    submitBtn.element.form!.requestSubmit(submitBtn.element);
    await flushPromises();

    const shifts = useShiftsStore();
    expect(shifts.shifts).toHaveLength(1);
    expect(shifts.shifts[0].payRate).toBe(27.2727);
    expect(shifts.shifts[0].income.toFixed(2)).toBe('200.00');

    wrapper.unmount();
  });

  it('updates the total when the shift times change', async () => {
    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });

    await wrapper.get('#pay-rate').setValue('30');
    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('220.00');

    await wrapper.get('#end-time').setValue('2026-11-28T17:00');
    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('240.00');

    wrapper.unmount();
  });

  it('is disabled until the shift has billable time', async () => {
    const now = new Date(2026, 10, 28, 9, 0);
    const wrapper = mountDialog(pinia, { startTime: now, endTime: now });
    const total = wrapper.get<HTMLInputElement>('#total-pay');

    expect(total.element.disabled).toBe(true);
    expect(total.element.placeholder).toBe('Set times first');

    await wrapper.get('#end-time').setValue('2026-11-28T10:00');
    expect(total.element.disabled).toBe(false);

    wrapper.unmount();
  });

  it('shows and takes amounts in the currency picked in the menu, but saves AUD', async () => {
    const currency = useCurrencyStore();
    currency.$patch({
      displayCurrency: 'USD',
      exchangeRates: { base: 'AUD', date: '2026-11-27', fetchedAt: Date.now(), rates: { USD: 0.5 } }
    });

    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });
    await flushPromises();

    // The symbol matches the menu currency
    expect(wrapper.get('#total .currency-symbol').text()).toBe(currencySymbol('USD'));
    expect(wrapper.get('#pay-rate').element.parentElement!.firstElementChild!.textContent).toBe(currencySymbol('USD'));

    // 15 USD/h is 30 AUD/h at 0.5
    await wrapper.get('#workplace').setValue('Cafe');
    await wrapper.get('#pay-rate').setValue('15');
    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('110.00');
    expect(wrapper.get('.total-breakdown').text()).toBe(`7h 20m × ${currencyFormat(15, 'USD')}/h`);
    expect(wrapper.get('.saved-total').text()).toBe(`Saved in AUD: ${currencyFormat(220, 'AUD')}`);

    // A typed total is in USD too
    const total = wrapper.get<HTMLInputElement>('#total-pay');
    await total.setValue('100');
    await total.trigger('blur');
    expect(total.element.value).toBe('100.00');

    const submitBtn = wrapper.get<HTMLButtonElement>('#add-shift-btn');
    submitBtn.element.form!.requestSubmit(submitBtn.element);
    await flushPromises();

    const saved = useShiftsStore().shifts[0];
    expect(saved.income.toFixed(2)).toBe('200.00'); // 100 USD = 200 AUD
    expect(saved.payRate).toBe(27.2727);

    wrapper.unmount();
  });

  it('keeps enough precision for a converted hourly rate over a long shift', async () => {
    useCurrencyStore().$patch({
      displayCurrency: 'USD',
      exchangeRates: { base: 'AUD', date: '2026-11-27', fetchedAt: Date.now(), rates: { USD: 0.66401 } }
    });

    const wrapper = mountDialog(pinia, {
      startTime: new Date(2026, 10, 28, 8, 0),
      endTime: new Date(2026, 10, 28, 20, 0) // 12 hours
    });
    await flushPromises();

    await wrapper.get('#pay-rate').setValue('20.10');
    await wrapper.get('#pay-rate').trigger('blur');

    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('241.20');
    expect(wrapper.get<HTMLInputElement>('#pay-rate').element.value).toBe('20.1');

    wrapper.unmount();
  });

  it('shows the converted amounts if rates arrive while typing', async () => {
    // A USD preference, but no rates yet: the form falls back to AUD
    const currency = useCurrencyStore();
    currency.$patch({ displayCurrency: 'USD', exchangeRates: null });

    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });
    await flushPromises();

    const payRate = wrapper.get<HTMLInputElement>('#pay-rate');
    await payRate.setValue('30'); // 30 AUD/h, still focused (no blur)
    expect(payRate.attributes('aria-label')).toBe('Pay rate in AUD per hour');

    currency.$patch({
      exchangeRates: { base: 'AUD', date: '2026-11-27', fetchedAt: Date.now(), rates: { USD: 0.5 } }
    });
    await flushPromises();

    // Same saved amount, now shown in USD
    expect(payRate.attributes('aria-label')).toBe('Pay rate in USD per hour');
    expect(payRate.element.value).toBe('15');
    expect(wrapper.get<HTMLInputElement>('#total-pay').element.value).toBe('110.00');

    // A half-typed total is reconciled too
    const total = wrapper.get<HTMLInputElement>('#total-pay');
    await total.setValue('100'); // USD
    currency.$patch({ displayCurrency: 'AUD' });
    await flushPromises();
    expect(total.element.value).toBe('200.00');

    wrapper.unmount();
  });

  it('keeps whole-unit currencies exact, e.g. VND', async () => {
    useCurrencyStore().$patch({
      displayCurrency: 'VND',
      exchangeRates: { base: 'AUD', date: '2026-11-27', fetchedAt: Date.now(), rates: { VND: 17165 } }
    });

    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty });
    await flushPromises();
    const total = wrapper.get<HTMLInputElement>('#total-pay');

    await total.setValue('3000000');
    await total.trigger('blur');
    expect(total.element.value).toBe('3000000');

    wrapper.unmount();
  });

  it('labels saved pay rates in the menu currency and picks the exact saved rate', async () => {
    useCurrencyStore().$patch({
      displayCurrency: 'USD',
      exchangeRates: { base: 'AUD', date: '2026-11-27', fetchedAt: Date.now(), rates: { USD: 0.66401 } }
    });
    const workInfos = useWorkInfosStore();
    workInfos.workInfos = new Map([['Cafe', new WorkInfo({ id: 'w1', workplace: 'Cafe', payRates: new Set([25.5]) })]]);

    const wrapper = mountDialog(pinia, { ...sevenHoursTwenty, workplace: 'Cafe' });
    await flushPromises();

    const option = wrapper.findAll('.datalist .item').find((item) => item.text().startsWith('16.9323 '))!;
    expect(option).toBeDefined(); // 25.5 AUD at 0.66401
    await option.trigger('mousedown');

    expect(wrapper.get<HTMLInputElement>('#pay-rate').element.value).toBe('16.9323');
    expect((wrapper.vm as unknown as { formData: { payRate: number } }).formData.payRate).toBe(25.5);

    wrapper.unmount();
  });
});
