import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import Shift from '@/models/Shift';
import { useShiftsStore } from '@/stores/shiftsStore';

function day(date: number) {
  const start = new Date(2026, 10, date, 0, 0, 0, 0);
  const end = new Date(2026, 10, date + 1, 0, 0, 0, 0);
  return [start, end] as const;
}

describe('shiftsStore.stats', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('counts a shift on the day it ends', () => {
    const store = useShiftsStore();
    // Thu 26 Nov 10pm -> Fri 27 Nov 6am
    store.shifts = [
      new Shift({
        workplace: 'Night',
        payRate: 30,
        startTime: new Date(2026, 10, 26, 22, 0),
        endTime: new Date(2026, 10, 27, 6, 0)
      })
    ];

    expect(store.stats(...day(26)).income.beforeTax).toBe(0);
    expect(store.stats(...day(27)).income.beforeTax).toBe(240);
  });

  it('counts a shift ending exactly at midnight once, on the day before', () => {
    const store = useShiftsStore();
    // Fri 27 Nov 4pm -> Sat 28 Nov 12am
    store.shifts = [
      new Shift({
        workplace: 'Close',
        payRate: 25,
        startTime: new Date(2026, 10, 27, 16, 0),
        endTime: new Date(2026, 10, 28, 0, 0)
      })
    ];

    expect(store.stats(...day(27)).income.beforeTax).toBe(200);
    expect(store.stats(...day(28)).income.beforeTax).toBe(0);

    // Same for weeks: ends at Mon 30 Nov 12am -> belongs to the week starting Mon 23 Nov only
    store.shifts = [
      new Shift({
        workplace: 'Close',
        payRate: 25,
        startTime: new Date(2026, 10, 29, 16, 0),
        endTime: new Date(2026, 10, 30, 0, 0)
      })
    ];
    const week1 = [new Date(2026, 10, 23), new Date(2026, 10, 30)] as const;
    const week2 = [new Date(2026, 10, 30), new Date(2026, 11, 7)] as const;

    expect(store.stats(...week1).income.beforeTax).toBe(200);
    expect(store.stats(...week2).income.beforeTax).toBe(0);
  });
});
