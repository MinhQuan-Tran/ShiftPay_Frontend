<script lang="ts">
import { mapStores } from 'pinia';

import BaseDialog from '@/components/BaseDialog.vue';

import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import Shift from '@/models/Shift';
import WorkInfo from '@/models/WorkInfo';
import type { ImportParsedData } from '@/types';

type ImportStep = 'select' | 'preview' | 'importing' | 'complete' | 'error';

function hasCheckInTime(data: unknown): data is { checkInTime?: unknown; } {
  return typeof data === 'object' && data !== null && 'checkInTime' in data;
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function readNumberSet(value: unknown): Set<number> | null {
  if (value === undefined) {
    return new Set<number>();
  }

  if (!Array.isArray(value)) {
    if (typeof value !== 'number') {
      return null;
    }

    return new Set<number>([value]);
  }

  if (!value.every((entry) => typeof entry === 'number')) {
    return null;
  }

  return new Set<number>(value);
}

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
      (this.$refs.dialog as HTMLDialogElement).showModal();
    },

    close() {
      (this.$refs.dialog as HTMLDialogElement).close();
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
      } catch (error) {
        this.importError = 'Failed to read file: ' + (error instanceof Error ? error.message : String(error));
        this.step = 'error';
      }
    },

    parseData(data: unknown) {
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
        const source = isJsonRecord(data) ? data : null;
        const shiftsJson = typeof source?.shifts === 'string' ? source.shifts : typeof source?.entries === 'string' ? source.entries : '[]';
        const shiftsRaw = JSON.parse(shiftsJson) as unknown;
        const parsedShifts = Array.isArray(shiftsRaw) ? shiftsRaw : [];
        const parsed = Shift.parseAll(parsedShifts);
        result.shifts = parsed.shifts;
        if (!parsed.success) {
          result.shiftErrors.push(`${parsedShifts.length - parsed.shifts.length} shift(s) could not be parsed`);
        }
      } catch (error) {
        result.shiftErrors.push('Failed to parse shifts: ' + (error instanceof Error ? error.message : String(error)));
      }

      // Parse templates (supports both array and object-map formats)
      try {
        const source = isJsonRecord(data) ? data : null;
        const templatesJson =
          typeof source?.shiftTemplates === 'string'
            ? source.shiftTemplates
            : typeof source?.templates === 'string'
              ? source.templates
              : '{}';
        const templatesRaw = JSON.parse(templatesJson) as unknown;
        const templateEntries: [string, unknown][] = Array.isArray(templatesRaw)
          ? templatesRaw.map((item) => [isJsonRecord(item) && typeof item.templateName === 'string' ? item.templateName : '', item])
          : Object.entries(isJsonRecord(templatesRaw) ? templatesRaw : {});
        for (const [name, template] of templateEntries) {
          try {
            if (!name || typeof name !== 'string') {
              throw new Error('Missing or invalid template name');
            }
            const templateRecord = isJsonRecord(template) ? template : null;
            const templateValue = templateRecord?.shift ?? templateRecord?.entry ?? template;
            result.templates.set(name, Shift.parse(templateValue));
          } catch (error) {
            result.templateErrors.push(`Template "${name || '(unnamed)'}": ${(error instanceof Error ? error.message : String(error))}`);
          }
        }
      } catch (error) {
        result.templateErrors.push('Failed to parse templates: ' + (error instanceof Error ? error.message : String(error)));
      }

      // Parse work infos (supports both array and object-map formats)
      try {
        const source = isJsonRecord(data) ? data : null;
        const workInfosJson =
          typeof source?.workInfos === 'string'
            ? source.workInfos
            : typeof source?.prevWorkInfos === 'string'
              ? source.prevWorkInfos
              : '{}';
        const workInfosRaw = JSON.parse(workInfosJson) as unknown;
        const entries: [string, unknown][] = Array.isArray(workInfosRaw)
          ? workInfosRaw.map((item) => [isJsonRecord(item) && typeof item.workplace === 'string' ? item.workplace : '', item])
          : Object.entries(isJsonRecord(workInfosRaw) ? workInfosRaw : {});
        for (const [workplace, info] of entries) {
          try {
            if (!workplace || typeof workplace !== 'string') {
              throw new Error('Missing or invalid workplace name');
            }
            if (!isJsonRecord(info)) {
              throw new Error('Invalid data format');
            }
            const payRates = readNumberSet(info.payRates ?? info.payRate);
            if (payRates === null) {
              throw new Error('Invalid pay rates');
            }
            result.workInfos.set(
              workplace,
              new WorkInfo({
                id: typeof info.id === 'string' ? info.id : crypto.randomUUID(),
                workplace,
                payRates
              })
            );
          } catch (error) {
            result.workInfoErrors.push(`Workplace "${workplace}": ${(error instanceof Error ? error.message : String(error))}`);
          }
        }
      } catch (error) {
        result.workInfoErrors.push('Failed to parse work infos: ' + (error instanceof Error ? error.message : String(error)));
      }

      // Parse check-in time
      if (hasCheckInTime(data) && data.checkInTime !== undefined && data.checkInTime !== null) {
        const checkInTimeValue = data.checkInTime;

        if (
          typeof checkInTimeValue === 'string' ||
          typeof checkInTimeValue === 'number' ||
          checkInTimeValue instanceof Date
        ) {
          const parsed = new Date(checkInTimeValue);
          if (isNaN(parsed.getTime())) {
            result.checkInTimeError = 'Invalid check-in time format';
          } else {
            result.checkInTime = parsed;
          }
        } else {
          result.checkInTimeError = 'Invalid check-in time format';
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.importError = 'Import failed: ' + message;
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
          <button class="btn-primary" @click="close">Done</button>
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
          <button class="btn-tertiary" @click="close">Cancel</button>
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

.dropzone>* {
  background-color: transparent;
}

.dropzone:hover,
.dropzone.dragging {
  border-color: var(--accent-color, #4a90d9);
  --background-color: rgba(74, 144, 217, 0.05);
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
