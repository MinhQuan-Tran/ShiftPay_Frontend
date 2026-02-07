<script lang="ts">
import { mapStores } from 'pinia';

import BaseDialog from '@/components/BaseDialog.vue';

import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import Shift from '@/models/Shift';
import type { WorkInfo, ImportParsedData } from '@/types';

type ImportStep = 'select' | 'preview' | 'importing' | 'complete' | 'error';

export default {
  components: { BaseDialog },

  emits: ['complete'],

  data() {
    return {
      step: 'select' as ImportStep,
      isDragging: false,
      fileName: null as string | null,
      parsedData: null as ImportParsedData | null,
      importError: null as string | null
    };
  },

  computed: {
    ...mapStores(useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore),

    hasErrors(): boolean {
      if (!this.parsedData) return false;
      return (
        this.parsedData.shiftErrors.length > 0 ||
        this.parsedData.templateErrors.length > 0 ||
        this.parsedData.workInfoErrors.length > 0 ||
        this.parsedData.checkInTimeError !== null
      );
    },

    hasData(): boolean {
      if (!this.parsedData) return false;
      return (
        this.parsedData.shifts.length > 0 ||
        this.parsedData.templates.size > 0 ||
        this.parsedData.workInfos.size > 0 ||
        this.parsedData.checkInTime !== null
      );
    },

    allErrors(): string[] {
      if (!this.parsedData) return [];
      const errors: string[] = [];
      errors.push(...this.parsedData.shiftErrors);
      errors.push(...this.parsedData.templateErrors);
      errors.push(...this.parsedData.workInfoErrors);
      if (this.parsedData.checkInTimeError) {
        errors.push(this.parsedData.checkInTimeError);
      }
      return errors;
    }
  },

  methods: {
    showModal() {
      this.reset();
      (this.$refs.dialog as any).showModal();
    },

    closeDialog() {
      (this.$refs.dialog as any).closeDialog();
      this.reset();
    },

    reset() {
      this.step = 'select';
      this.isDragging = false;
      this.fileName = null;
      this.parsedData = null;
      this.importError = null;
    },

    handleDragOver(e: DragEvent) {
      e.preventDefault();
      this.isDragging = true;
    },

    handleDragLeave() {
      this.isDragging = false;
    },

    handleDrop(e: DragEvent) {
      e.preventDefault();
      this.isDragging = false;
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.processFile(files[0]);
      }
    },

    handleFileSelect(e: Event) {
      const input = e.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        this.processFile(input.files[0]);
      }
    },

    triggerFileInput() {
      (this.$refs.fileInput as HTMLInputElement).click();
    },

    async processFile(file: File) {
      if (!file.name.endsWith('.json')) {
        this.importError = 'Please select a JSON file.';
        this.step = 'error';
        return;
      }

      this.fileName = file.name;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        this.parseData(data);
        this.step = 'preview';
      } catch (err: any) {
        this.importError = 'Failed to read file: ' + (err.message || String(err));
        this.step = 'error';
      }
    },

    parseData(data: any) {
      const result: ImportParsedData = {
        shifts: [],
        shiftErrors: [],
        templates: new Map(),
        templateErrors: [],
        workInfos: new Map(),
        workInfoErrors: [],
        checkInTime: null,
        checkInTimeError: null
      };

      // Parse shifts
      try {
        const shiftsRaw = JSON.parse(data.shifts || data.entries || '[]');
        const parsed = Shift.parseAll(shiftsRaw);
        result.shifts = parsed.shifts;
        if (!parsed.success) {
          result.shiftErrors.push(`${shiftsRaw.length - parsed.shifts.length} shift(s) could not be parsed`);
        }
      } catch (err: any) {
        result.shiftErrors.push('Failed to parse shifts: ' + (err.message || String(err)));
      }

      // Parse templates
      try {
        const templatesRaw = JSON.parse(data.shiftTemplates || data.templates || '{}');
        for (const [name, template] of Object.entries(templatesRaw) as [string, any][]) {
          try {
            result.templates.set(name, Shift.parse(template.shift || template.entry || template));
          } catch (err: any) {
            result.templateErrors.push(`Template "${name}": ${err.message || String(err)}`);
          }
        }
      } catch (err: any) {
        result.templateErrors.push('Failed to parse templates: ' + (err.message || String(err)));
      }

      // Parse work infos
      try {
        const workInfosRaw = JSON.parse(data.workInfos || data.prevWorkInfos || '{}');
        for (const [workplace, info] of Object.entries(workInfosRaw) as [string, any][]) {
          try {
            if (typeof info !== 'object' || info === null) {
              throw new Error('Invalid data format');
            }
            const payRates = new Set<number>(info.payRates || info.payRate || []);
            if (![...payRates].every((rate) => typeof rate === 'number')) {
              throw new Error('Invalid pay rates');
            }
            result.workInfos.set(workplace, { payRates } as WorkInfo);
          } catch (err: any) {
            result.workInfoErrors.push(`Workplace "${workplace}": ${err.message || String(err)}`);
          }
        }
      } catch (err: any) {
        result.workInfoErrors.push('Failed to parse work infos: ' + (err.message || String(err)));
      }

      // Parse check-in time
      if (data.checkInTime) {
        try {
          const parsed = new Date(data.checkInTime);
          if (isNaN(parsed.getTime())) {
            result.checkInTimeError = 'Invalid check-in time format';
          } else {
            result.checkInTime = parsed;
          }
        } catch (err: any) {
          result.checkInTimeError = 'Failed to parse check-in time';
        }
      }

      this.parsedData = result;
    },

    async confirmImport() {
      if (!this.parsedData) return;

      this.step = 'importing';

      try {
        // Import shifts
        if (this.parsedData.shifts.length > 0) {
          await this.shiftsStore.add(this.parsedData.shifts as Shift[]);
        }

        // Import templates
        for (const [name, template] of this.parsedData.templates) {
          await this.shiftTemplatesStore.add(name, template as Shift);
        }

        // Import work infos
        for (const [workplace, info] of this.parsedData.workInfos) {
          for (const rate of info.payRates) {
            await this.workInfosStore.add(workplace, rate);
          }
        }

        // Import check-in time
        if (this.parsedData.checkInTime) {
          this.shiftSessionStore.set(this.parsedData.checkInTime);
        }

        this.step = 'complete';
        this.$emit('complete');
      } catch (err: any) {
        this.importError = 'Import failed: ' + (err.message || String(err));
        this.step = 'error';
      }
    },

    goBack() {
      this.step = 'select';
      this.parsedData = null;
      this.importError = null;
    }
  }
};
</script>

<template>
  <BaseDialog ref="dialog" title="Import Data" :resetForms="true">
    <div class="import-dialog">
      <!-- Step 1: Select File -->
      <template v-if="step === 'select'">
        <p class="description">
          Import data from a previously exported JSON file.
        </p>

        <div class="dropzone" :class="{ dragging: isDragging }" @dragover="handleDragOver" @dragleave="handleDragLeave"
          @drop="handleDrop" @click="triggerFileInput">
          <div class="dropzone-icon">📁</div>
          <p class="dropzone-text">
            <strong>Drop file here</strong> or click to browse
          </p>
          <p class="dropzone-hint">Accepts .json files</p>
        </div>

        <input ref="fileInput" type="file" accept=".json" @change="handleFileSelect" class="hidden-input" />
      </template>

      <!-- Step 2: Preview -->
      <template v-else-if="step === 'preview'">
        <p class="description">
          Review the data before importing from <strong>{{ fileName }}</strong>
        </p>

        <div class="preview-summary">
          <h4>Data found:</h4>
          <ul v-if="hasData">
            <li v-if="parsedData!.shifts.length > 0">
              <span class="count">{{ parsedData!.shifts.length }}</span> shift{{ parsedData!.shifts.length !== 1 ? 's' :
                '' }}
            </li>
            <li v-if="parsedData!.templates.size > 0">
              <span class="count">{{ parsedData!.templates.size }}</span> template{{ parsedData!.templates.size !== 1 ?
                's' : '' }}
            </li>
            <li v-if="parsedData!.workInfos.size > 0">
              <span class="count">{{ parsedData!.workInfos.size }}</span> workplace{{ parsedData!.workInfos.size !== 1 ?
                's' : '' }}
            </li>
            <li v-if="parsedData!.checkInTime">
              Check-in time: {{ parsedData!.checkInTime.toLocaleString() }}
            </li>
          </ul>
          <p v-else class="no-data">No valid data found in file.</p>
        </div>

        <div v-if="hasErrors" class="warnings">
          <h4>⚠️ Warnings:</h4>
          <ul>
            <li v-for="(error, index) in allErrors" :key="index">{{ error }}</li>
          </ul>
        </div>

        <div class="actions">
          <button class="btn-primary" @click="confirmImport" :disabled="!hasData">
            Import Data
          </button>
          <button class="btn-secondary" @click="goBack">
            Choose Different File
          </button>
        </div>
      </template>

      <!-- Step 3: Importing -->
      <template v-else-if="step === 'importing'">
        <div class="status-container">
          <div class="spinner"></div>
          <p>Importing data...</p>
        </div>
      </template>

      <!-- Step 4: Complete -->
      <template v-else-if="step === 'complete'">
        <div class="status-container success">
          <div class="status-icon">✓</div>
          <p>Import complete!</p>
        </div>
        <div class="actions">
          <button class="btn-primary" @click="closeDialog">Done</button>
        </div>
      </template>

      <!-- Error State -->
      <template v-else-if="step === 'error'">
        <div class="status-container error">
          <div class="status-icon">✗</div>
          <p>{{ importError }}</p>
        </div>
        <div class="actions">
          <button class="btn-secondary" @click="goBack">Try Again</button>
          <button class="btn-tertiary" @click="closeDialog">Cancel</button>
        </div>
      </template>
    </div>
  </BaseDialog>
</template>

<style scoped>
.import-dialog {
  padding: var(--padding);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.description {
  margin: 0;
  color: var(--text-color);
}

.hidden-input {
  display: none;
}

.dropzone {
  border: 2px dashed var(--border-color, #ccc);
  border-radius: var(--border-radius);
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--background-color);
}

.dropzone:hover,
.dropzone.dragging {
  border-color: var(--accent-color, #4a90d9);
  background-color: rgba(74, 144, 217, 0.05);
}

.dropzone-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.dropzone-text {
  margin: 0 0 0.25rem 0;
  color: var(--text-color);
}

.dropzone-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}

.preview-summary {
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  padding: 1rem;
}

.preview-summary h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.preview-summary ul {
  margin: 0;
  padding-left: 1.25rem;
}

.preview-summary li {
  margin: 0.25rem 0;
}

.preview-summary .count {
  font-weight: bold;
  color: var(--accent-color, #4a90d9);
}

.preview-summary .no-data {
  margin: 0;
  color: var(--text-muted);
  font-style: italic;
}

.warnings {
  background-color: #fff8e1;
  border-radius: var(--border-radius);
  padding: 1rem;
}

.warnings h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #f57c00;
}

.warnings ul {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.9rem;
  color: #e65100;
}

.warnings li {
  margin: 0.25rem 0;
}

.status-container {
  text-align: center;
  padding: 2rem 1rem;
}

.status-container p {
  margin: 1rem 0 0 0;
  font-size: 1.1rem;
}

.status-container.success .status-icon {
  width: 3rem;
  height: 3rem;
  margin: 0 auto;
  border-radius: 50%;
  background-color: #4caf50;
  color: white;
  font-size: 1.5rem;
  line-height: 3rem;
}

.status-container.error .status-icon {
  width: 3rem;
  height: 3rem;
  margin: 0 auto;
  border-radius: 50%;
  background-color: #f44336;
  color: white;
  font-size: 1.5rem;
  line-height: 3rem;
}

.spinner {
  width: 2.5rem;
  height: 2.5rem;
  margin: 0 auto;
  border: 3px solid var(--border-color, #ccc);
  border-top-color: var(--accent-color, #4a90d9);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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

@media (prefers-color-scheme: dark) {
  .warnings {
    background-color: rgba(255, 152, 0, 0.1);
  }

  .warnings h4 {
    color: #ffb74d;
  }

  .warnings ul {
    color: #ffa726;
  }
}
</style>
