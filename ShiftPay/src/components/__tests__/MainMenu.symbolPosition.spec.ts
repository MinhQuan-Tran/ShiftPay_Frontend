import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// The menu loads the currency list when it opens; keep that offline
vi.mock('@/api', () => ({
  default: { exchangeRates: { latest: vi.fn().mockRejectedValue(new Error('offline')) } }
}));

import MainMenu from '@/components/MainMenu.vue';
import { useCurrencyStore } from '@/stores/currencyStore';
import { currencySymbol } from '@/utils';

describe('MainMenu — Symbol Position', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('switches between "$20" and "20$"', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(MainMenu, { props: { showLegends: true }, global: { plugins: [pinia] } });
    const button = wrapper.get('#menu-symbol-position-btn');
    const symbol = currencySymbol('AUD');

    expect(button.get('.menu-select').text()).toBe(`${symbol}20`);

    await button.trigger('click');
    expect(useCurrencyStore().symbolPosition).toBe('after');
    expect(button.get('.menu-select').text()).toBe(`20${symbol}`);

    await button.trigger('click');
    expect(useCurrencyStore().symbolPosition).toBe('before');
  });
});
