import { defineStore } from 'pinia';
import api from '@/api';
import WorkInfo from '@/models/WorkInfo';
import { useAuthStore } from './authStore';
import { STATUS, type Status } from '@/types';
import { withStatus } from '@/utils';

export const useWorkInfosStore = defineStore('workInfos', {
  state: () => ({
    /** Map keyed by workplace, storing id and payRates */
    workInfos: new Map<string, WorkInfo>(),
    status: STATUS.Ready as Status
  }),

  actions: {
    async fetch(): Promise<void> {
      await withStatus(this, async () => {
        let parsedData = JSON.parse(localStorage.getItem('workInfos') || localStorage.getItem('prevWorkInfos') || '[]');

        const auth = useAuthStore();
        const syncPending = localStorage.getItem('syncPending') === 'true';

        // Use local data if not authenticated OR if sync is pending (user clicked "Decide Later")
        if (auth.isAuthenticated && !syncPending) {
          parsedData = await api.workInfos.fetch();
        }

        console.log('Fetched work infos data:', parsedData);

        // Parse & Validate - store id, workplace, and payRates
        this.workInfos = new Map<string, WorkInfo>(
          parsedData.map((workInfo: WorkInfo) => [
            workInfo.workplace,
            new WorkInfo({
              id: workInfo.id,
              workplace: workInfo.workplace,
              payRates: new Set(workInfo.payRates ?? [])
            })
          ])
        );

        localStorage.removeItem('prevWorkInfos'); // Remove old key
      });
    },

    async add(workplace: string, payRate: number): Promise<void> {
      await withStatus(this, async () => {
        // Validate
        workplace = String(workplace).trim();
        if (workplace === '') {
          throw new Error('Workplace cannot be empty');
        }

        payRate = Number(payRate);
        if (isNaN(payRate)) {
          throw new Error('Invalid pay rate');
        }

        const existingEntry = this.workInfos.get(workplace);

        // Remote update
        const auth = useAuthStore();

        if (auth.isAuthenticated) {
          const workInfo = await api.workInfos.createOrUpdate(
            new WorkInfo({
              // If id is provided and exists, updates; otherwise creates.
              id: existingEntry?.id ?? '',
              workplace,
              payRates: new Set<number>([payRate])
            })
          );

          // Replace with server response to ensure consistency
          this.workInfos.set(
            workInfo.workplace,
            new WorkInfo({
              id: workInfo.id,
              workplace: workInfo.workplace,
              payRates: new Set(workInfo.payRates ?? [])
            })
          );

          return;
        }

        // Local update
        if (existingEntry) {
          return existingEntry.payRates.add(payRate);
        }

        this.workInfos.set(
          workplace,
          new WorkInfo({
            id: crypto.randomUUID(),
            workplace,
            payRates: new Set<number>([payRate])
          })
        );
      });
    },

    /**
     * Delete a work info by workplace name, or remove a specific pay rate.
     * Uses the stored ID for the API call.
     */
    async delete(workplace: string, payRate?: number): Promise<void> {
      await withStatus(this, async () => {
        const auth = useAuthStore();
        const entry = this.workInfos.get(workplace);

        // Remote update
        if (auth.isAuthenticated) {
          if (!entry?.id) {
            throw new Error(`Cannot delete: "${workplace}" not found`);
          }

          await api.workInfos.delete(entry.id, payRate);
          await this.fetch(); // Refresh from server
          return;
        }

        // Local update
        if (payRate === undefined) {
          this.workInfos.delete(workplace);
          return;
        }

        entry?.payRates.delete(Number(payRate));
      });
    },

    /**
     * Persist to localStorage on ANY state change (detached subscription).
     * Mirrors shiftStore's auto-persist pattern.
     * Serializes as array of WorkInfoDTO-like objects for consistency with API format.
     */
    enableAutoPersist(): void {
      this.$subscribe(
        function (_mutation, state) {
          const serialized = Array.from(state.workInfos.values()).map((entry) => ({
            id: entry.id,
            workplace: entry.workplace,
            payRates: Array.from(entry.payRates)
          }));
          localStorage.setItem('workInfos', JSON.stringify(serialized));
        },
        { detached: true }
      );
    }
  }
});
