<script lang="ts">
import { mapStores } from 'pinia';

import api from '@/api';
import BaseDialog from '@/components/BaseDialog.vue';

import { useAuthStore } from '@/stores/authStore';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';

import Shift from '@/models/Shift';
import { STATUS } from '@/types';

export default {
  components: { BaseDialog },

  emits: ['complete'],

  data() {
    return {
      isProcessing: false,
      error: null as string | null
    };
  },

  computed: {
    ...mapStores(useAuthStore, useShiftsStore, useShiftTemplatesStore, useWorkInfosStore),

    localShiftCount(): number {
      return this.shiftsStore.shifts.length;
    },

    localTemplateCount(): number {
      return this.shiftTemplatesStore.templates.size;
    },

    localWorkplaceCount(): number {
      return this.workInfosStore.workInfos.size;
    },

    hasLocalData(): boolean {
      return this.localShiftCount > 0 || this.localTemplateCount > 0 || this.localWorkplaceCount > 0;
    }
  },

  methods: {
    showModal() {
      (this.$refs.dialog as any).showModal();
    },

    closeDialog() {
      (this.$refs.dialog as any).closeDialog();
    },

    async uploadLocalData() {
      this.isProcessing = true;
      this.error = null;

      try {
        // Clear the pending flag before uploading
        localStorage.removeItem('syncPending');

        this.shiftsStore.status = STATUS.Loading;
        this.workInfosStore.status = STATUS.Loading;
        this.shiftTemplatesStore.status = STATUS.Loading;

        // Upload shifts
        if (this.shiftsStore.shifts.length > 0) {
          await api.shifts.createBatch(this.shiftsStore.shifts as Shift[]);
        }

        // Upload work infos
        const workInfoPromises: Promise<any>[] = [];
        this.workInfosStore.workInfos.forEach((info, workplace) => {
          if (info.payRates.size > 0) {
            workInfoPromises.push(
              api.workInfos.createOrUpdate(workplace, [...info.payRates], info.id)
            );
          }
        });
        await Promise.all(workInfoPromises);

        // Upload shift templates
        const templatePromises: Promise<any>[] = [];
        this.shiftTemplatesStore.templates.forEach((template, name) => {
          templatePromises.push(
            api.shiftTemplates.createOrUpdate(name, template.shift as Shift, template.id)
          );
        });
        await Promise.all(templatePromises);

        this.$emit('complete');
        this.closeDialog();
      } catch (err: any) {
        console.error('Error uploading local data:', err);
        this.error = err.message || 'Failed to upload data. Please try again.';
      } finally {
        this.isProcessing = false;
        this.shiftsStore.status = STATUS.Ready;
        this.workInfosStore.status = STATUS.Ready;
        this.shiftTemplatesStore.status = STATUS.Ready;
      }
    },

    startFresh() {
      // Clear the pending flag so stores will fetch from server
      localStorage.removeItem('syncPending');
      // Emit complete to trigger fresh fetch from server (which will be empty)
      this.$emit('complete');
      this.closeDialog();
    },

    decideLater() {
      // Close dialog without syncing - user can decide later
      this.closeDialog();
    }
  }
};
</script>

<template>
  <BaseDialog ref="dialog" title="Sync Your Data">
    <div class="sync-dialog-content">
      <p class="description">
        Your online account doesn't have any data yet. Would you like to upload your local data?
      </p>

      <div v-if="hasLocalData" class="data-summary">
        <h4>Local data found:</h4>
        <ul>
          <li v-if="localShiftCount > 0">
            <span class="count">{{ localShiftCount }}</span> shift{{ localShiftCount !== 1 ? 's' : '' }}
          </li>
          <li v-if="localTemplateCount > 0">
            <span class="count">{{ localTemplateCount }}</span> template{{ localTemplateCount !== 1 ? 's' : '' }}
          </li>
          <li v-if="localWorkplaceCount > 0">
            <span class="count">{{ localWorkplaceCount }}</span> workplace{{ localWorkplaceCount !== 1 ? 's' : '' }}
          </li>
        </ul>
      </div>

      <div v-else class="no-data">
        <p>No local data found. You're starting fresh!</p>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div class="actions">
        <button v-if="hasLocalData" class="btn-primary" @click="uploadLocalData" :disabled="isProcessing">
          {{ isProcessing ? 'Uploading...' : 'Upload to Account' }}
        </button>

        <button class="btn-secondary" @click="startFresh" :disabled="isProcessing">
          Start Fresh
        </button>

        <button class="btn-tertiary" @click="decideLater" :disabled="isProcessing">
          Decide Later
        </button>
      </div>

      <p class="note">
        <small>Your local data will be kept until you choose to sync or clear it.</small>
      </p>
    </div>
  </BaseDialog>
</template>

<style scoped>
.sync-dialog-content {
  padding: var(--padding);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.description {
  margin: 0;
  color: var(--text-color);
}

.data-summary {
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  padding: 1rem;
}

.data-summary h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.data-summary ul {
  margin: 0;
  padding-left: 1.25rem;
}

.data-summary li {
  margin: 0.25rem 0;
}

.data-summary .count {
  font-weight: bold;
  color: var(--accent-color, #4a90d9);
}

.no-data {
  text-align: center;
  padding: 1rem;
  color: var(--text-muted);
}

.no-data p {
  margin: 0;
}

.error-message {
  background-color: #ffebee;
  color: #c62828;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  font-size: 0.9rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.actions button {
  padding: 0.75rem 1rem;
  border: none;
  border-radius: var(--border-radius);
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.1s ease;
}

.actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.actions button:not(:disabled):active {
  transform: scale(0.98);
}

.btn-primary {
  background-color: var(--accent-color, #4a90d9);
  color: white;
}

.btn-primary:not(:disabled):hover {
  opacity: 0.9;
}

.btn-secondary {
  background-color: var(--background-color);
  color: var(--text-color);
  border: 1px solid var(--border-color, #ddd) !important;
}

.btn-secondary:not(:disabled):hover {
  background-color: var(--hover-color, #f0f0f0);
}

.btn-tertiary {
  background-color: transparent;
  color: var(--text-muted, #666);
}

.btn-tertiary:not(:disabled):hover {
  text-decoration: underline;
}

.note {
  margin: 0;
  text-align: center;
  color: var(--text-muted, #666);
}
</style>
