import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

// The menu loads the currency list when it opens; keep that offline
vi.mock('@/api', () => ({
  default: { exchangeRates: { latest: vi.fn().mockRejectedValue(new Error('offline')) } }
}));

import MainMenu from '@/components/MainMenu.vue';

describe('MainMenu — Day Income toggle', () => {
  let pinia: Pinia;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('offers to show day income when it is off, and emits the toggle', async () => {
    const wrapper = mount(MainMenu, { props: { showLegends: true }, global: { plugins: [pinia] } });
    const button = wrapper.get('#menu-day-income-btn');

    expect(button.text()).toBe('Show Day Income');
    await button.trigger('click');
    expect(wrapper.emitted('toggle-day-income')).toHaveLength(1);
  });

  it('offers to hide day income when it is on', () => {
    const wrapper = mount(MainMenu, {
      props: { showLegends: true, showDayIncome: true },
      global: { plugins: [pinia] }
    });

    expect(wrapper.get('#menu-day-income-btn').text()).toBe('Hide Day Income');
  });
});
