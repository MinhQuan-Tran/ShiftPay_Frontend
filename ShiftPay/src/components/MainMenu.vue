<script lang="ts">
import { mapStores } from 'pinia';

import { useAuthStore } from '@/stores/authStore';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import Shift from '@/models/Shift';
import type { WorkInfo } from '@/types';

export default {
  computed: {
    ...mapStores(useAuthStore, useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore)
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

    uploadData(event: Event) {
      if (!confirm('Are you sure you want to import data?')) return;

      const fileInput = event.target as HTMLInputElement;
      const file = fileInput.files ? fileInput.files[0] : null;

      if (!file) return;

      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>): void => {
        console.log('File uploaded');

        const data = JSON.parse(e.target?.result as string);

        console.log('Parsed data:', data);

        console.log('Validating data...');

        const shifts = new Promise<Shift[]>((resolve, reject) => {
          try {
            const parsedShifts = Shift.parseAll(JSON.parse(data.shifts || data.entries));
            console.log('Shifts:', parsedShifts);

            if (!parsedShifts.success && !confirm('Some shifts could not be loaded. Do you want to proceed?')) {
              // Stop import process
              throw new Error('User aborted due to parse errors.');
            }

            console.log('Shifts parsed successfully.');
            resolve(parsedShifts.shifts);
          } catch (error) {
            reject(error);
          }
        });

        const templates = new Promise<Map<string, Shift>>((resolve, reject) => {
          try {
            const parsedTemplates: Map<string, Shift> = Object.entries(JSON.parse(data.shiftTemplates || data.templates)).reduce((acc: any, [name, template]: [string, any]) => {
              try {
                acc.set(name, Shift.parse(template.shift || template.entry || template));
              } catch (error) {
                if (!confirm(`Failed to parse template "${name}". Do you want to skip it?`)) {
                  // Stop import process
                  throw new Error('User aborted due to parse errors.');
                }

                console.warn(`Skipping template "${name}" due to parse error.`);
                return acc;
              }

              return acc;
            }, new Map<string, Shift>());
            console.log('Templates:', parsedTemplates);

            if (typeof parsedTemplates !== 'object' || parsedTemplates === null) {
              throw new Error('Invalid templates data.');
            }

            console.log('Templates parsed successfully.');
            resolve(parsedTemplates);
          } catch (error) {
            reject(error);
          }
        });

        const workInfos = new Promise<Map<string, WorkInfo>>((resolve, reject) => {
          try {
            const parsedWorkInfos: Map<string, WorkInfo> = Object.entries(JSON.parse(data.workInfos || data.prevWorkInfos)).reduce((acc: any, [workplace, info]: [string, any]) => {
              if (typeof info !== 'object' || info === null) {
                if (!confirm(`Invalid data for workplace "${workplace}". Do you want to skip it?`)) {
                  // Stop import process
                  throw new Error('User aborted due to parse errors.');
                }

                console.warn(`Skipping workplace "${workplace}" due to invalid data.`);
                return acc;
              }

              try {
                const payRates = new Set(info.payRates || info.payRate);

                if (![...payRates].every((rate: any) => typeof rate === 'number')) {
                  throw new Error(`Invalid pay rates for workplace "${workplace}".`);
                }

                acc.set(workplace, {
                  payRates
                } as WorkInfo);
              } catch (error) {
                if (!confirm(`Failed to parse pay rates for workplace "${workplace}". Do you want to skip it?`)) {
                  // Stop import process
                  throw error;
                }

                console.warn(`Skipping workplace "${workplace}" due to parse error.`);
                return acc;
              }

              return acc;
            }, new Map<string, WorkInfo>());
            console.log('Work Infos:', parsedWorkInfos);

            if (typeof parsedWorkInfos !== 'object' || parsedWorkInfos === null) {
              throw new Error('Invalid work infos data.');
            }

            console.log('Work Infos parsed successfully.');
            resolve(parsedWorkInfos);
          } catch (error) {
            reject(error);
          }
        });

        const checkInTime = new Promise<Date | null>((resolve, reject) => {
          if (!data.checkInTime) {
            console.log('No Check-In Time found.');
            resolve(null);
            return;
          }

          try {
            const parsedCheckInTime = new Date(data.checkInTime);

            if (isNaN(parsedCheckInTime.getTime())) {
              if (!confirm('Invalid Check-In Time. Do you want to skip it?')) {
                // Stop import process
                throw new Error('User aborted due to parse errors.');
              }

              console.warn('Skipping Check-In Time due to invalid data.');
              resolve(null);
            }

            console.log('Check-In Time parsed successfully.');
            resolve(parsedCheckInTime);
          } catch (error) {
            reject(error);
          }
        });

        Promise.all([shifts, templates, workInfos, checkInTime]).then(([shifts, templates, workInfos, checkInTime]) => {
          console.log('All data validated. Importing...');

          this.shiftsStore.add(shifts);

          templates.forEach((template: Shift, name: string) => {
            this.shiftTemplatesStore.add(name, template);
          });

          workInfos.forEach((info: WorkInfo, workplace: string) => {
            info.payRates.forEach((rate: number) => {
              this.workInfosStore.add(workplace, rate);
            });
          });

          if (checkInTime) this.shiftSessionStore.set(checkInTime);
          else this.shiftSessionStore.clear();
        })
          .then(() => {
            console.log('Data import complete.');
            alert('Data import complete.');
          })
          .catch((error) => {
            console.error('Error during data import:', error);
            alert(`Error during data import`);
          });
      };

      reader.readAsText(file);
    },

    async handleLogin() {
      await this.authStore.login();
      this.shiftsStore.fetch();
      this.workInfosStore.fetch();
      this.shiftTemplatesStore.fetch();
    }
  }
};
</script>

<template>
  <div class="main-menu">
    <input type="file" id="fileInput" accept=".json" @change="uploadData" />
    <button id="downloadButton" @click="downloadData">Download Data</button>
    <button v-if="!authStore.isAuthenticated" @click="handleLogin">Login</button>
    <button v-else @click="authStore.logout">Logout</button>
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
