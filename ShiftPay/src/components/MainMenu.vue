<script lang="ts">
import { mapStores } from 'pinia';

import { useAuthStore } from '@/stores/authStore';

export default {
  emits: ['login', 'import', 'tutorial'],

  computed: {
    ...mapStores(useAuthStore),

    isSyncPending(): boolean {
      return localStorage.getItem('syncPending') === 'true';
    }
  },

  methods: {
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

    <span class="menu-heading">Account</span>
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

    <span class="menu-heading">Help</span>
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
  background-color: var(--popup-background-color);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.18),
    0 2px 8px rgba(0, 0, 0, 0.12);
  animation: menu-enter 0.18s ease-out;
}

@keyframes menu-enter {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ── Section headings ── */
.menu-heading {
  padding: 0.5em 1em 0.25em;
  font-size: 0.7em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-color-faded);
  pointer-events: none;
  user-select: none;
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
  gap: 0.7em;
  padding: 0.6em 1em;
  margin: 0 0.4em;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-color);
  font-weight: 500;
  font-size: 0.95em;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  box-shadow: none;
  line-height: 1.4;
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
  font-size: 1.05em;
  flex-shrink: 0;
  border-radius: 6px;
  background: transparent;
}

/* ── Label ── */
.menu-label {
  background: transparent;
  flex: 1;
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
