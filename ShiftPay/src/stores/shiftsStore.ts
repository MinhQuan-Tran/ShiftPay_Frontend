import { defineStore } from 'pinia';
import { api } from '@/api';
import { useAuthStore } from './authStore';
import Shift from '@/models/Shift';
import Duration from '@/models/Duration';

export const STAT_OPTIONS = {
  income: {
    beforeTax: {
      label: 'Before Tax',
      iconURL: 'https://img.icons8.com/fluency/48/cash--v1.png'
    }
  },

  hours: {
    total: {
      label: 'Total Hours',
      iconURL: 'https://img.icons8.com/fluency/48/clock.png'
    },
    billable: {
      label: 'Billable Hours',
      iconURL: 'https://img.icons8.com/fluency/48/time-card.png'
    },
    breakTime: {
      label: 'Break Time',
      iconURL: 'https://img.icons8.com/fluency/48/tea.png'
    }
  }
};

export const useShiftsStore = defineStore('shifts', {
  state: () => ({
    shifts: [] as Shift[]
  }),

  getters: {
    range(state): (startTime: Date, endTime: Date) => Shift[] {
      return (startTime: Date, endTime: Date): Shift[] => {
        return (state.shifts as Shift[]).filter((shift) => {
          return (
            // 'startTime' is before the next day of the selected date
            new Date(shift.startTime) < endTime &&
            // 'endTime' is after the start of the selected date
            new Date(shift.endTime) > startTime
          );
        });
      };
    },

    day(): (selectedDate: Date) => Shift[] {
      return (selectedDate: Date): Shift[] => {
        if (!(selectedDate instanceof Date) || isNaN(selectedDate.getTime())) {
          return [];
        } else {
          const startTime = new Date(selectedDate);
          startTime.setHours(0, 0, 0, 0);

          const endTime = new Date(selectedDate);
          endTime.setDate(endTime.getDate() + 1);
          endTime.setHours(0, 0, 0, 0);

          return this.range(startTime, endTime);
        }
      };
    },

    stats(): (
      startTime: Date,
      endTime: Date
    ) => {
      income: { beforeTax: number };
      hours: { total: Duration; billable: Duration; breakTime: Duration };
    } {
      return (startTime: Date, endTime: Date) => {
        // Filter shifts that end within the range
        const shiftsInRange = this.range(startTime, endTime).filter((shift) => shift.endTime <= endTime);

        return {
          income: {
            beforeTax: shiftsInRange.reduce((sum: number, shift: Shift) => sum + shift.income, 0)
          },

          hours: {
            total: shiftsInRange.reduce((sum: Duration, shift: Shift) => sum.add(shift.duration), new Duration()),

            billable: shiftsInRange.reduce(
              (sum: Duration, shift: Shift) => sum.add(shift.billableDuration),
              new Duration()
            ),

            breakTime: shiftsInRange.reduce(
              (sum: Duration, shift: Shift) => sum.add(shift.totalBreakDuration),
              new Duration()
            )
          }
        };
      };
    }
  },

  actions: {
    // TODO: Add parameters for filtering
    async fetch(): Promise<void> {
      const authStore = useAuthStore();

      try {
        let rawData = JSON.parse(localStorage.getItem('shifts') || localStorage.getItem('entries') || '[]');

        // API if authenticated; otherwise localStorage
        if (authStore.isAuthenticated) {
          rawData = await api.shifts.fetch();
        }

        const parsed = Shift.parseAll(rawData);

        this.shifts = parsed.shifts;
        if (!parsed.success) {
          alert('Some shifts could not be loaded.');
        }

        localStorage.removeItem('entries'); // Remove old key
      } catch (error: any) {
        console.error(error);
        throw new Error('Failed to fetch shifts: ' + (error && error.message ? error.message : String(error)));
      }
    },

    async add(input: Shift | Shift[]): Promise<void> {
      console.log('Adding shifts:', input);

      const rawItems = Array.isArray(input) ? input : [input];

      // Validate
      const validatedShifts: Shift[] = [];
      const invalidErrors: string[] = [];

      rawItems.forEach((item, index) => {
        try {
          validatedShifts.push(Shift.parse(item));
        } catch (error: any) {
          invalidErrors.push(`Item #${index} is invalid: ${error?.message ?? String(error)}`);
        }
      });

      if (invalidErrors.length) {
        throw new Error('Invalid shift input — ' + invalidErrors.join(' | '));
      }

      if (validatedShifts.length === 0) return;

      const auth = useAuthStore();

      if (!auth.isAuthenticated) {
        this.shifts.push(...validatedShifts);
        return;
      }

      try {
        if (validatedShifts.length === 1) {
          // Single-shift create
          const created = await api.shifts.create(validatedShifts[0]);
          console.log('Created shift from API:', created);
          const parsed = Shift.parse(created);
          this.shifts.push(parsed);
        } else {
          // Batch create
          const createdBatch = await api.shifts.createBatch(validatedShifts);
          console.log('Created shifts from API (batch):', createdBatch);

          const parsedBatch = Shift.parseAll(createdBatch).shifts;
          this.shifts.push(...parsedBatch);
        }
      } catch (error: any) {
        throw new Error('Some shifts could not be created — ' + (error?.message ?? String(error)));
      }
    },

    async update(id: string, shiftToUpdate: Shift): Promise<void> {
      const authStore = useAuthStore();

      // Validate
      try {
        shiftToUpdate = Shift.parse(shiftToUpdate);
      } catch (error: any) {
        throw new Error('Invalid shift input: ' + (error && error.message ? error.message : String(error)));
      }

      // If not authenticated, just save locally (only if it exists)
      if (!authStore.isAuthenticated) {
        const index = this.shifts.findIndex((shift) => shift.id === id);

        // Not found
        if (index === -1) {
          throw new Error('Cannot update shift: ID not found');
        }

        this.shifts[index] = shiftToUpdate;
        return;
      }

      try {
        const updated = await api.shifts.update(id, shiftToUpdate);

        const index = this.shifts.findIndex((shift) => shift.id === updated.id);

        // No need to check for -1; if not found, js will add it
        this.shifts[index] = Shift.parse(updated);
        return;
      } catch (error: unknown) {
        throw new Error('Failed to update shift: ' + (error instanceof Error ? error.message : String(error)));
      }
    },

    async delete(input?: string | string[]): Promise<void> {
      const authStore = useAuthStore();

      if (authStore.isAuthenticated) {
        try {
          await api.shifts.delete(input);
        } catch (error: any) {
          throw new Error('Failed to delete shift: ' + (error && error.message ? error.message : String(error)));
        }
      }

      // Single shift ID
      if (typeof input === 'string') this.shifts = this.shifts.filter((shift) => shift.id !== input);
      // Multiple shift IDs
      else if (Array.isArray(input)) this.shifts = this.shifts.filter((shift) => !input.includes(shift.id));
      // Clear all shifts
      else if (input === undefined) this.shifts = [];
      else throw new Error('Invalid input type for delete');
    },

    /**
     * Call once (after Pinia is installed) to enable automatic localStorage persistence.
     * Saves on any state change (mutation from any action).
     */
    enableAutoPersist(): void {
      this.$subscribe(
        (_mutation, state) => {
          localStorage.setItem('shifts', JSON.stringify(state.shifts));
        },
        // Detached so it persists even if component that created the store unmounts
        { detached: true }
      );
    }
  }
});
