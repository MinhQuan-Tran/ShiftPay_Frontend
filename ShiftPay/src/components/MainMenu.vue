<script lang="ts">
import { mapStores } from 'pinia';

import { useAuthStore } from '@/stores/authStore';

export default {
  emits: ['login', 'import'],

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
  <div class="main-menu">
    <button @click="$emit('import')">Import Data</button>
    <button @click="downloadData">Export Data</button>
    <button v-if="!authStore.isAuthenticated" @click="handleLogin">Login</button>
    <button v-else @click="authStore.logout" :disabled="isSyncPending"
      :title="isSyncPending ? 'Sync your data first' : ''">
      Logout
    </button>
  </div>
</template>

<style scoped>
.main-menu {
  position: absolute;
  top: calc(100% + var(--padding));
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  gap: var(--padding);
  width: 250px;
  border-radius: var(--border-radius);
  background-color: var(--popup-background-color);
}
</style>
