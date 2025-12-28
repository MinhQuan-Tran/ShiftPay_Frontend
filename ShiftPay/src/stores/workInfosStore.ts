import { defineStore } from 'pinia';
import { api } from '@/api';
import { useAuthStore } from './authStore';
import type { WorkInfo } from '@/types';
import { STATUS, type Status } from '@/types';
import { withStatus } from '@/utils';

export const useWorkInfosStore = defineStore('workInfos', {
  state: () => ({
    workInfos: new Map<string, WorkInfo>(),
    status: STATUS.Ready as Status
  }),

  actions: {
    async fetch(): Promise<void> {
      await withStatus(this, async () => {
        let parsedData = JSON.parse(localStorage.getItem('workInfos') || localStorage.getItem('prevWorkInfos') || '[]');

        try {
          const auth = useAuthStore();

          if (auth.isAuthenticated) {
            parsedData = await api.workInfos.fetch();
          }
          // Parse & Validate
          this.workInfos = new Map<string, WorkInfo>(
            parsedData.map((workInfo: any) => [workInfo.workplace, { payRates: new Set(workInfo.payRates) }])
          );

          localStorage.removeItem('prevWorkInfos'); // Remove old key
        } catch (error: any) {
          console.error(error);
          throw new Error(
            'Failed to fetch previous work infos: ' + (error && error.message ? error.message : String(error))
          );
        }
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

        // Remote update
        const auth = useAuthStore();

        if (auth.isAuthenticated) {
          try {
            const workInfo = await api.workInfos.create(workplace, [payRate]);

            // Replace with server response to ensure consistency
            this.workInfos.set(workInfo.workplace, { payRates: new Set(workInfo.payRates) });

            return;
          } catch (error: any) {
            throw new Error('Failed to add work info: ' + (error?.message ?? String(error)));
          }
        }

        // Local update
        if (!this.workInfos.has(workplace)) {
          this.workInfos.set(workplace, { payRates: new Set<number>() });
        }
        this.workInfos.get(workplace)!.payRates.add(payRate);
      });
    },

    async delete(workplace: string, payRate?: number): Promise<void> {
      await withStatus(this, async () => {
        // Remote update
        const auth = useAuthStore();

        if (auth.isAuthenticated) {
          try {
            await api.workInfos.delete(workplace, payRate);

            await this.fetch(); // Refresh from server (delete may affect the whole workInfo or just one pay rate)
          } catch (error: any) {
            throw new Error('Failed to delete work info: ' + (error?.message ?? String(error)));
          }
        }

        // Local update
        if (payRate === undefined) {
          this.workInfos.delete(workplace);
          return;
        }

        this.workInfos.get(workplace)?.payRates.delete(Number(payRate));
      });
    },

    /**
     * Persist to localStorage on ANY state change (detached subscription).
     * Mirrors shiftStore's auto-persist pattern.
     */
    enableAutoPersist(): void {
      this.$subscribe(
        function (_mutation, state) {
          localStorage.setItem(
            'workInfos',
            JSON.stringify(
              Array.from(state.workInfos, (workInfo) => {
                console.log(workInfo);
                return {
                  workplace: workInfo[0],
                  payRates: Array.from(workInfo[1].payRates)
                };
              })
            )
          );
        },
        { detached: true }
      );
    }
  }
});
