import { defineStore } from 'pinia';
import { STATUS, type Status } from '@/types';
import { withStatus } from '@/utils';

export const useShiftSessionStore = defineStore('shiftSession', {
  state: () => ({
    startTime: undefined as Date | undefined,
    status: STATUS.Ready as Status
  }),

  getters: {
    isInProgress(state): boolean {
      return state.startTime !== undefined && state.startTime instanceof Date && !isNaN(state.startTime.getTime());
    }
  },

  actions: {
    async fetch(): Promise<void> {
      await withStatus(this, async () => {
        // Load from localStorage
        const rawData = localStorage.getItem('startTime') || localStorage.getItem('checkInTime');

        if (rawData) {
          const date = new Date(rawData);

          if (!isNaN(date.getTime())) {
            return this.set(date);
          }
        }

        this.clear();
      });
    },

    set(date?: Date) {
      this.startTime = date ?? new Date();
    },

    clear() {
      this.startTime = undefined;
    },

    /**
     * Persist to localStorage on ANY state change (detached subscription).
     * Mirrors shiftStore's auto-persist pattern.
     */
    enableAutoPersist(): void {
      this.$subscribe(
        function (_mutation, state) {
          if (state.startTime instanceof Date) {
            localStorage.setItem('startTime', state.startTime.toISOString());
          } else {
            localStorage.removeItem('startTime');
            localStorage.removeItem('checkInTime');
          }
        },
        { detached: true }
      );
    }
  }
});
