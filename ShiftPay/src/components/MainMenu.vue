<script lang="ts">
import { mapStores } from 'pinia';

import { STATUS } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useCurrencyStore } from '@/stores/currencyStore';
import { currencyFormat } from '@/utils';

// Currency names for the picker, e.g. "VND – Vietnamese Dong" (falls back to the code alone)
let currencyNames: Intl.DisplayNames | null = null;
try {
  currencyNames = new Intl.DisplayNames([navigator.language], { type: 'currency' });
} catch {
  currencyNames = null;
}

export default {
  props: {
    showLegends: {
      type: Boolean,
      required: true
    },
    showDayIncome: {
      type: Boolean,
      default: false
    },
  },

  emits: ['login', 'import', 'tutorial', 'changelog', 'toggle-legends', 'toggle-day-income'],

  computed: {
    ...mapStores(useAuthStore, useCurrencyStore),

    // How amounts look, e.g. "$20" or "20$"
    symbolPositionExample(): string {
      return currencyFormat(
        20,
        this.currencyStore.activeCurrency,
        { minimumFractionDigits: 0, maximumFractionDigits: 0 },
        this.currencyStore.symbolPosition
      );
    },

    currencyNote(): string {
      const currency = this.currencyStore;

      if (currency.status === STATUS.Loading) return 'Loading exchange rates…';
      if (currency.isMissingRate) return `Exchange rates unavailable, showing ${currency.baseCurrency}`;
      if (!currency.isConverting || currency.rate === null || !currency.exchangeRates) return '';

      const rate = new Intl.NumberFormat([], { maximumSignificantDigits: 5 }).format(currency.rate);
      const date = new Date(`${currency.exchangeRates.date}T00:00:00`).toLocaleDateString(navigator.language, {
        day: 'numeric',
        month: 'short'
      });

      // Non-breaking spaces keep "(27 Nov)" and "0.66401 USD" together when the line wraps
      return `1 ${currency.baseCurrency} = ${rate}\u00a0${currency.displayCurrency} (${date.replace(/ /g, '\u00a0')})`;
    },

    isSyncPending(): boolean {
      return localStorage.getItem('syncPending') === 'true';
    }
  },

  mounted() {
    // Fill the currency picker (uses the cached rates while they are fresh)
    this.currencyStore.refreshRates().catch((error) => console.error('Could not load the currency list:', error));
  },

  methods: {
    currencyLabel(code: string): string {
      const name = currencyNames?.of(code);
      return name && name !== code ? `${code} – ${name}` : code;
    },

    toggleSymbolPosition() {
      this.currencyStore.setSymbolPosition(this.currencyStore.symbolPosition === 'after' ? 'before' : 'after');
    },

    async changeCurrency(code: string) {
      try {
        await this.currencyStore.setDisplayCurrency(code);
      } catch (error) {
        // The note under the picker tells the user amounts stay in the pay currency
        console.error(`Could not switch to ${code}:`, error);
      }
    },

    downloadData() {
      const data = JSON.stringify(localStorage);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'localStorageData.json';
      a.click();
      URL.revokeObjectURL(url);
    },

    async handleLogin() {
      // Emit event first, let parent handle the full flow
      // This ensures the dialog can be shown even after menu closes
      this.$emit('login');
    }
  }
};
</script>

<template>
  <div class="main-menu" @click.stop>
    <span class="menu-heading">Data</span>
    <button class="menu-item" @click="$emit('import')">
      <span class="menu-icon">
        <img class="inline-icon" src="https://img.icons8.com/fluency/96/login-rounded.png" alt="import" />
      </span>
      <span class="menu-label">Import Data</span>
    </button>
    <button class="menu-item" @click="downloadData">
      <span class="menu-icon">
        <img class="inline-icon" src="https://img.icons8.com/fluency/96/logout-rounded.png" alt="export" />
      </span>
      <span class="menu-label">Export Data</span>
    </button>

    <hr class="menu-divider" />

    <span class="menu-heading">Account (Beta)</span>
    <button v-if="!authStore.isAuthenticated" id="menu-login-btn" class="menu-item" @click="handleLogin">
      <span class="menu-icon">
        <img class="inline-icon" src="https://img.icons8.com/fluency/96/enter-2.png" alt="login" />
      </span>
      <span class="menu-label">Login</span>
    </button>
    <button v-else class="menu-item menu-item--danger" @click="authStore.logout" :disabled="isSyncPending"
      :title="isSyncPending ? 'Sync your data first' : ''">
      <span class="menu-icon">
        <img class="inline-icon" src="https://img.icons8.com/fluency/96/export.png" alt="logout" />
      </span>
      <span class="menu-label">Logout</span>
      <span v-if="isSyncPending" class="menu-badge">Sync first</span>
    </button>

    <hr class="menu-divider" />

    <span class="menu-heading">Display</span>
    <button class="menu-item" @click="$emit('toggle-legends')">
      <span class="menu-icon">
        <img v-if="showLegends" class="inline-icon" src="https://img.icons8.com/fluency/96/visible.png" alt="visible">
        <img v-else class="inline-icon" src="https://img.icons8.com/fluency/96/blind.png" alt="hidden">
      </span>
      <span class="menu-label">{{ showLegends ? 'Hide' : 'Show' }} Legends</span>
    </button>
    <button id="menu-day-income-btn" class="menu-item" @click="$emit('toggle-day-income')"
      :aria-pressed="showDayIncome">
      <span class="menu-icon">
        <img class="inline-icon" src="https://img.icons8.com/fluency/96/cash--v1.png" alt="day income" />
      </span>
      <span class="menu-label">{{ showDayIncome ? 'Hide' : 'Show' }} Day Income</span>
    </button>
    <button id="menu-symbol-position-btn" class="menu-item" @click="toggleSymbolPosition"
      title="Put the currency symbol before or after amounts"
      :aria-label="`Currency symbol ${currencyStore.symbolPosition} the amount (${symbolPositionExample})`">
      <span class="menu-icon">💲</span>
      <span class="menu-label">Symbol Position</span>
      <span class="menu-select" aria-hidden="true">{{ symbolPositionExample }}</span>
    </button>
    <label id="menu-currency" class="menu-item btn" for="currency-select"
      :title="`Show and enter amounts in another currency. Shifts are still saved in ${currencyStore.baseCurrency}.`">
      <span class="menu-icon">💱</span>
      <span class="menu-label">Currency</span>
      <!-- Shows just the code; the (invisible) native select on top lists the full names -->
      <span class="menu-select">
        <span aria-hidden="true">{{ currencyStore.displayCurrency }} ▾</span>
        <select id="currency-select" :value="currencyStore.displayCurrency"
          @change="changeCurrency(($event.target as HTMLSelectElement).value)">
          <option v-for="code in currencyStore.availableCurrencies" :key="code" :value="code">
            {{ currencyLabel(code) }}
          </option>
        </select>
      </span>
      <!-- Rate details, on their own row under "Currency" and the picker -->
      <small v-if="currencyNote" class="menu-note" aria-live="polite">
        {{ currencyNote }}
        <template v-if="currencyStore.isConverting">
          · <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer">Frankfurter</a>
        </template>
      </small>
    </label>


    <hr class="menu-divider" />

    <span class="menu-heading">Help</span>
    <button id="menu-changelog-btn" class="menu-item" @click="$emit('changelog')">
      <span class="menu-icon">
        <img class="inline-icon" src="https://img.icons8.com/fluency/96/news.png" alt="changelog" />
      </span>
      <span class="menu-label">What&apos;s New</span>
    </button>
    <button id="menu-tutorial-btn" class="menu-item" @click="$emit('tutorial')">
      <span class="menu-icon">❓</span>
      <span class="menu-label">Tutorial</span>
    </button>
  </div>
</template>

<style scoped>
.main-menu {
  position: absolute;
  top: calc(100% + 0.6em);
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  cursor: default;
  width: 240px;
  padding: 0.4em 0;
  border-radius: 12px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.18),
    0 2px 8px rgba(0, 0, 0, 0.12);
  background: light-dark(rgba(255, 255, 255, 0.5), rgba(18, 18, 18, 0.42));
  border: 1px solid light-dark(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.16));
  transform-origin: top right;
  backdrop-filter: blur(50px) saturate(140%);
  -webkit-backdrop-filter: blur(50px) saturate(140%);
}

/* Vue Transition for menu open/close */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: all var(--transition-duration) ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.97, 0.8);
}

.menu-fade-enter-to,
.menu-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1, 1);
}



/* ── Section headings ── */
.menu-heading {
  padding: 0.5em 1em 0.25em;
  font-size: small;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-color-faded);
  pointer-events: none;
  user-select: none;
  background: transparent;
}

/* ── Divider ── */
.menu-divider {
  border: none;
  height: 1px;
  margin: 0.3em 0.8em;
  background: var(--hover-overlay);
}

/* ── Menu items ── */
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.3em;
  margin: 0 0.4em;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-color);
  font-weight: 500;
  font-size: 0.85em;
  cursor: pointer;
  transition: all var(--transition-duration) ease;
  box-shadow: none;
  text-align: left;
  justify-content: flex-start;
}

.menu-item:hover {
  background: var(--hover-overlay);
  box-shadow: none;
  opacity: 1;
  transform: none;
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-item:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

/* ── Icon ── */
.menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6em;
  height: 1.6em;
  flex-shrink: 0;
  border-radius: 6px;
  background: transparent;
}

/* ── Label ── */
.menu-label {
  background: transparent;
  flex: 1;
}

/* ── Currency picker ── */
.menu-select {
  position: relative;
  padding: 0 0.6em;
  border-radius: 6px;
  background: var(--input-background-color);
  white-space: nowrap;
}

.menu-select:focus-within {
  outline: 2px solid var(--primary-color);
}

.menu-select select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  font: inherit;
  cursor: pointer;
}

/* Currency item: icon, label and picker on the first row, rate details on the second */
#menu-currency {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    'icon label select'
    '.    note  note';
  align-items: center;
}

#menu-currency .menu-icon {
  grid-area: icon;
}

#menu-currency .menu-label {
  grid-area: label;
}

#menu-currency .menu-select {
  grid-area: select;
}

#menu-currency .menu-note {
  grid-area: note;
  padding-bottom: 0.2em;
}

.menu-note {
  display: block;
  font-size: 0.8em;
  font-weight: normal;
  line-height: 1.3;
  color: var(--text-color-faded);
  background: transparent;
}

.menu-note a {
  color: inherit;
}

/* ── Badge (sync warning) ── */
.menu-badge {
  font-size: 0.65em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15em 0.5em;
  border-radius: 4px;
  background: var(--warning-color);
  color: var(--text-color-black);
}

/* ── Danger variant ── */
.menu-item--danger {
  color: var(--danger-color);
}

.menu-item--danger:hover {
  background: light-dark(rgba(255, 100, 100, 0.1), rgba(255, 100, 100, 0.15));
}

/* ── Disabled state ── */
.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-item:disabled:hover {
  background: transparent;
  transform: none;
}
</style>
