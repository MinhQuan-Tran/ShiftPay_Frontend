import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

import WeekSchedule from '@/components/WeekSchedule.vue';
import Shift from '@/models/Shift';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useShiftsStore } from '@/stores/shiftsStore';
import { compactCurrencyFormat, currencyFormat, currencySymbol } from '@/utils';

function dayCell(wrapper: ReturnType<typeof mount>, date: number) {
  // Only days of the current month (not the faded days from the months either side)
  return wrapper.findAll('.day-container').find((cell) => {
    const day = cell.find('.day');
    return !day.classes('prev-month') && !day.classes('next-month') && day.text() === String(date);
  })!;
}

describe('WeekSchedule — income on calendar days', () => {
  let pinia: Pinia;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 28, 9, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountWithShifts(showDayIncome = true) {
    const shifts = useShiftsStore();
    shifts.shifts = [
      // Two shifts on Mon 2 Nov: 4h × $25 + 2h × $30 = $160
      new Shift({
        workplace: 'A',
        payRate: 25,
        startTime: new Date(2026, 10, 2, 9),
        endTime: new Date(2026, 10, 2, 13)
      }),
      new Shift({
        workplace: 'B',
        payRate: 30,
        startTime: new Date(2026, 10, 2, 18),
        endTime: new Date(2026, 10, 2, 20)
      }),
      // Overnight shift counts on the day it ends (Sat 7 Nov)
      new Shift({
        workplace: 'C',
        payRate: 20,
        startTime: new Date(2026, 10, 6, 22),
        endTime: new Date(2026, 10, 7, 6)
      })
    ];

    const start = new Date(2026, 10, 28);
    const end = new Date(2026, 10, 29);
    return mount(WeekSchedule, {
      props: { selectedRange: { start, end }, showDayIncome },
      global: { plugins: [pinia] }
    });
  }

  it('is off by default', () => {
    const shifts = useShiftsStore();
    shifts.shifts = [
      new Shift({
        workplace: 'A',
        payRate: 25,
        startTime: new Date(2026, 10, 2, 9),
        endTime: new Date(2026, 10, 2, 13)
      })
    ];
    const start = new Date(2026, 10, 28);
    const end = new Date(2026, 10, 29);
    const wrapper = mount(WeekSchedule, { props: { selectedRange: { start, end } }, global: { plugins: [pinia] } });

    expect(wrapper.find('.day-income').exists()).toBe(false);
    expect(wrapper.get('.calendar').classes()).not.toContain('show-day-income');
  });

  it('can be turned off', () => {
    const wrapper = mountWithShifts(false);
    expect(wrapper.find('.day-income').exists()).toBe(false);
  });

  it('shows each day’s income under the date', () => {
    const wrapper = mountWithShifts();

    expect(dayCell(wrapper, 2).find('.day-income').text()).toBe(compactCurrencyFormat(160));
    expect(dayCell(wrapper, 6).find('.day-income').exists()).toBe(false);
    expect(dayCell(wrapper, 7).find('.day-income').text()).toBe(compactCurrencyFormat(160));
    expect(dayCell(wrapper, 3).find('.day-income').exists()).toBe(false);
  });

  it('puts the symbol after amounts in the weekly and monthly stats when chosen', async () => {
    const wrapper = mountWithShifts(false);
    const symbol = currencySymbol('AUD');

    // Week of Mon 2 Nov: $160 + $160 (the overnight shift ends Sat 7 Nov)
    const weekly = () => wrapper.findAll('.weekly .stat').map((stat) => stat.text());
    expect(weekly()).toContain(currencyFormat(320, 'AUD', {}, 'before'));

    useCurrencyStore().setSymbolPosition('after');
    await wrapper.vm.$nextTick();

    expect(weekly()).toContain(currencyFormat(320, 'AUD', {}, 'after'));
    expect(weekly().every((stat) => stat.endsWith(symbol))).toBe(true);
    expect(wrapper.get('.monthly .stat').text()).toBe(currencyFormat(320, 'AUD', {}, 'after'));
  });

  it('follows the display currency', async () => {
    const wrapper = mountWithShifts();
    useCurrencyStore().$patch({
      displayCurrency: 'EUR',
      exchangeRates: { base: 'AUD', date: '2026-11-27', fetchedAt: Date.now(), rates: { EUR: 0.5 } }
    });
    await wrapper.vm.$nextTick();

    expect(dayCell(wrapper, 2).find('.day-income').text()).toBe(compactCurrencyFormat(80, 'EUR'));
  });
});
