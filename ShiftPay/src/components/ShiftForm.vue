<script lang="ts">
import Shift from '@/models/Shift';
import Duration from '@/models/Duration';
import { deepClone } from '@/utils';
import { STATUS } from '@/types';

import { mapStores } from 'pinia';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import ButtonConfirm from './ButtonConfirm.vue';
import ComboBox from './ComboBox.vue';
import InputLabel from './InputLabel.vue';

export default {
  props: {
    selectedDate: {
      type: Date,
      required: true
    },
    shift: {
      type: Object as () => Partial<Shift>,
      default: () => ({}) as Partial<Shift>
    },
    action: {
      type: String,
      required: true
    }
  },

  data() {
    return {
      STATUS,
      formData: deepClone<Partial<Shift>>(this.shift),
      saveShiftTemplate: false,
      deleteShiftTemplate: false,
      repeatPreset: 'none',
      templateName: '',
      hiddenElements: [] as Element[], // Elements to hide when holding a button in action bar
      currentAction: '', // Track the current action being performed for loading state
    };
  },

  computed: {
    ...mapStores(useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore),

    isEditingTemplate(): boolean {
      return this.saveShiftTemplate && this.shiftTemplatesStore.templates.has(this.templateName);
    },
  },

  emits: {
    shiftChange(payload: { action: string; shift: Shift; }) {
      const actions = ['add', 'edit', 'delete', 'check in/out'];
      return actions.includes(payload.action);
    }
  },

  methods: {
    setRepeatPreset(preset: 'none' | '1d' | '1w' | '1m' | 'custom') {
      // Set repeat fields for radio buttons
      const dayInput = this.$refs['repeat-day'] as HTMLInputElement | undefined;
      const monthInput = this.$refs['repeat-month'] as HTMLInputElement | undefined;
      const yearInput = this.$refs['repeat-year'] as HTMLInputElement | undefined;
      if (!dayInput || !monthInput || !yearInput) return;
      switch (preset) {
        case 'none':
          dayInput.value = '0';
          monthInput.value = '0';
          yearInput.value = '0';
          break;
        case '1d':
          dayInput.value = '1';
          monthInput.value = '0';
          yearInput.value = '0';
          break;
        case '1w':
          dayInput.value = '7';
          monthInput.value = '0';
          yearInput.value = '0';
          break;
        case '1m':
          dayInput.value = '0';
          monthInput.value = '1';
          yearInput.value = '0';
          break;
        case 'custom':
          // Do not change values
          break;
      }
      this.repeatPreset = preset;
    },

    // Cannot use alert directly on event
    alert(message: string) {
      alert(message);
    },

    async quickAddShift(shift: Shift) {
      console.log('Quick adding shift:', shift);

      const newShift = new Shift({
        workplace: shift.workplace,
        payRate: shift.payRate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        unpaidBreaks: shift.unpaidBreaks
      });

      const duration = newShift.endTime.getTime() - newShift.startTime.getTime();

      newShift.startTime.setFullYear(
        this.selectedDate.getFullYear(),
        this.selectedDate.getMonth(),
        this.selectedDate.getDate()
      );
      newShift.endTime.setTime(newShift.startTime.getTime() + duration);

      await this.shiftsStore.add(newShift);

      const form = this.$refs.shiftForm as HTMLFormElement;
      form.reset();

      const dialog = form.closest('dialog') as HTMLDialogElement;
      dialog?.close();
    },

    parseFormData(): Shift {
      try {
        return new Shift({
          id: this.formData.id!,
          workplace: this.formData.workplace!,
          payRate: this.formData.payRate!,
          startTime: this.formData.startTime!,
          endTime: this.formData.endTime!,
          unpaidBreaks: this.formData.unpaidBreaks ?? []
        });
      } catch (error) {
        alert('Invalid shift');
        console.error(this.formData);
        throw new Error('Invalid shift: ' + error);
      }
    },

    async shiftAction(event: Event) {
      const form = event.currentTarget as HTMLFormElement;

      const action = ((event as SubmitEvent)?.submitter as HTMLButtonElement).value;
      this.currentAction = action;

      try {
        // Match action with form data
        switch (action) {
          case 'add':
          case 'check in': {
            const shift = this.parseFormData();

            console.log('Adding shift:', shift);

            const newShifts: Shift[] = [];
            newShifts.push(shift);

            // Handle repeat shifts
            if (this.repeatPreset !== 'none') {
              const repeatDay = Number((this.$refs['repeat-day'] as HTMLInputElement)?.value) || 0;
              const repeatMonth = Number((this.$refs['repeat-month'] as HTMLInputElement)?.value) || 0;
              const repeatYear = Number((this.$refs['repeat-year'] as HTMLInputElement)?.value) || 0;

              const repeatEndDate = new Date(
                (this.$refs['repeat-end-date'] as HTMLInputElement)?.value ?? shift!.startTime
              );
              repeatEndDate.setHours(23, 59, 59, 999);

              const duration = shift!.endTime.getTime() - shift!.startTime.getTime();

              for (
                const currentFromDate = new Date(shift!.startTime);
                currentFromDate < repeatEndDate;
                // Skip the first shift as it's already added
              ) {
                // Increment the currentFromDate by the repeat interval
                currentFromDate.setDate(currentFromDate.getDate() + repeatDay);
                currentFromDate.setMonth(currentFromDate.getMonth() + repeatMonth);
                currentFromDate.setFullYear(currentFromDate.getFullYear() + repeatYear);

                const start = new Date(currentFromDate);
                const end = new Date(currentFromDate.getTime() + duration);

                const repeatShift = new Shift({
                  workplace: shift!.workplace,
                  payRate: shift!.payRate,
                  startTime: start,
                  endTime: end,
                  unpaidBreaks: shift!.unpaidBreaks
                });

                newShifts.push(repeatShift);
              }
            }

            // Batch the reactive update (one change, multiple shifts) -> better performance
            await this.shiftsStore.add(newShifts).catch((error) => {
              alert('Failed to add shift(s): ' + error);
              throw error;
            });

            // Add workplace and pay rate to workInfos (same info for multiple shifts)
            this.workInfosStore.add(shift.workplace, shift.payRate).catch((error) => {
              alert('Failed to add work info: ' + error);
              // Continue even if it fails
            });

            // Add shift template if needed
            if (this.saveShiftTemplate) {
              this.shiftTemplatesStore.add(this.templateName, shift).catch((error) => {
                alert('Failed to add shift template: ' + error);
                // Continue even if it fails
              });
            }

            // Remove check in time
            if (action === 'check in') {
              this.shiftSessionStore.clear();
            }

            break;
          }

          case 'edit': {
            const shift = this.parseFormData();
            if (!shift.id) {
              alert('Invalid shift');
              throw new Error('Invalid shift');
            }
            await this.shiftsStore.update(shift.id, shift).catch((error) => {
              alert('Failed to edit shift: ' + error);
              throw error;
            });

            break;
          }

          case 'delete':
            if (!this.formData || !this.formData.id) {
              alert('Invalid shift');
              throw new Error('Invalid shift');
            }

            await this.shiftsStore.delete(this.formData.id).catch((error) => {
              alert('Failed to delete shift: ' + error);
              throw error;
            });
            break;

          case 'edit template': {
            const shift = this.parseFormData();
            await this.shiftTemplatesStore.add(this.templateName, shift).catch((error) => {
              alert('Failed to update shift template: ' + error);
              throw error;
            });
            break;
          }

          case 'remove check in':
            this.shiftSessionStore.clear();
            break;

          default:
            alert('Invalid action');
            throw new Error('Invalid action');
        }

        form.reset();
      } finally {
        this.currentAction = '';
      }

      const dialog = form.closest('dialog') as HTMLDialogElement;
      dialog?.close();
    },

    resetForm() {
      // https://stackoverflow.com/a/50854892
      if (this.$options.data) {
        Object.assign(this.$data, (this.$options.data as any).call(this, this));
      }
    },

    toDateTimeLocal(date: Date | undefined) {
      if (!date) {
        return '';
      }

      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - offset * 60 * 1000);
      return localDate.toISOString().slice(0, 16);
    },

    applyTemplate(name: string) {
      this.templateName = name;
      const template = this.shiftTemplatesStore.templates.get(name);
      if (!template) return;

      const shift = template.shift as Shift;
      const duration = shift.endTime.getTime() - shift.startTime.getTime();

      this.formData.workplace = shift.workplace;
      this.formData.payRate = shift.payRate;

      // Adjust dates to selected date
      const startTime = new Date(shift.startTime);
      startTime.setFullYear(
        this.selectedDate.getFullYear(),
        this.selectedDate.getMonth(),
        this.selectedDate.getDate()
      );
      this.formData.startTime = startTime;
      this.formData.endTime = new Date(startTime.getTime() + duration);

      // Copy unpaid breaks
      this.formData.unpaidBreaks = (shift.unpaidBreaks ?? []).map(
        (b: Duration) => new Duration({ hours: b.hours, minutes: b.minutes })
      );
    },

    addUnpaidBreak() {
      if (!this.formData.unpaidBreaks) {
        this.formData.unpaidBreaks = [] as Duration[];
      }

      this.formData.unpaidBreaks.push(new Duration());
    }
  },

  components: {
    ButtonConfirm,
    ComboBox,
    InputLabel
  },

  watch: {
    shift() {
      this.resetForm();
    }
  }
};
</script>

<template>
  <form @submit.prevent="shiftAction" @reset.prevent="resetForm" ref="shiftForm">
    <input type="hidden" name="id" v-model="formData.id" />

    <!-- ── Shift Templates ── -->
    <div v-if="action === 'add'" class="form-section">
      <span class="section-label">Templates</span>

      <InputLabel label-text="Shift Templates" v-model:toggle-value="deleteShiftTemplate"
        toggle-color="var(--danger-color)" sub-text="Delete" :loading="shiftTemplatesStore.status === STATUS.Loading">
        <div class="shift-templates">
          <input v-for="[name, template] in shiftTemplatesStore.templates" :key="name" :value="name"
            @click="deleteShiftTemplate ? shiftTemplatesStore.delete(name) : quickAddShift(template.shift as Shift)"
            type="button" :class="['chip btn', { 'delete': deleteShiftTemplate }]" />
          <input type="button" :class="['btn add-item-btn', { active: saveShiftTemplate }]" value="+"
            id="save-shift-template-btn" @click="saveShiftTemplate = !saveShiftTemplate" />
        </div>
      </InputLabel>

      <InputLabel label-text="Template Name" for-id="template-name" v-if="saveShiftTemplate">
        <ComboBox :value="templateName" @update:value="applyTemplate"
          :list="Array.from(shiftTemplatesStore.templates.keys())">
          <input type="text" id="template-name" name="templateName" placeholder="e.g. McDonald | Delivery"
            v-model="templateName" required />
        </ComboBox>
      </InputLabel>
    </div>

    <!-- ── Job Details ── -->
    <div class="form-section">
      <span class="section-label">Job Details</span>

      <InputLabel label-text="Workplace" for-id="workplace" :loading="workInfosStore.status === STATUS.Loading">
        <ComboBox :value="formData?.workplace || ''"
          @update:value="newValue => { formData.workplace = newValue; formData.payRate = undefined; }"
          :list="Array.from(workInfosStore.workInfos.keys())"
          @delete-item="workInfo => workInfosStore.delete(workInfo).catch((error) => alert('Failed to delete workplace \n' + error.message))"
          deletable>
          <input type="search" id="workplace" name="workplace" placeholder="e.g. Company Name"
            v-model="formData.workplace" required />
        </ComboBox>
      </InputLabel>

      <InputLabel label-text="Pay Rate" for-id="pay-rate" :loading="workInfosStore.status === STATUS.Loading">
        <ComboBox :value="formData.payRate ? formData.payRate.toString() : ''"
          @update:value="(newValue: number | undefined) => (formData.payRate = Number(newValue))" :list="formData.workplace && workInfosStore.workInfos.get(formData.workplace)?.payRates
            ? Array.from(workInfosStore.workInfos.get(formData.workplace)?.payRates ?? []).map((pr) => pr.toString())
            : []
            "
          @delete-item="payRate => formData.workplace ? workInfosStore.delete(formData.workplace, Number(payRate)).catch((error) => alert('Failed to delete pay rate \n' + error.message)) : null"
          deletable>
          <input type="number" id="pay-rate" name="payRate" placeholder="e.g. 23.23" v-model="formData.payRate"
            step="0.01" required />
        </ComboBox>
      </InputLabel>
    </div>

    <!-- ── Schedule ── -->
    <div class="form-section">
      <span class="section-label">Schedule</span>

      <div class="time-row">
        <InputLabel label-text="Start Time" for-id="start-time">
          <input type="datetime-local" id="start-time" name="start-time" :value="toDateTimeLocal(formData.startTime)"
            @input="
              (event) => {
                formData.startTime = new Date((event.target as HTMLInputElement).value);
                if (formData.endTime && formData.startTime > formData.endTime) {
                  formData.endTime = formData.startTime;
                }
              }
            " required />
        </InputLabel>

        <InputLabel label-text="End Time" for-id="end-time">
          <input type="datetime-local" id="end-time" name="end-time" :value="toDateTimeLocal(formData.endTime)"
            :min="toDateTimeLocal(formData.startTime)"
            @input="(event) => (formData.endTime = new Date((event.target as HTMLInputElement).value))" required />
        </InputLabel>
      </div>
    </div>

    <!-- ── Unpaid Breaks ── -->
    <div class="form-section">
      <span class="section-label">Unpaid Breaks</span>

      <div class="unpaid-breaks">
        <div v-for="(unpaidBreak, index) in formData.unpaidBreaks" :key="index" class="unpaid-break">
          <!-- Hours -->
          <ComboBox @update:value="
            (hours) => {
              !isNaN(Number(hours))
                ? (formData.unpaidBreaks![index].hours = Number(hours))
                : alert('Invalid input: Please enter a valid number.');
            }
          " :list="[...Array((formData.billableDuration?.hours ?? 0) + 1).keys()].map(String)">
            <input type="number" name="unpaidBreak-hours" placeholder="hours"
              :value="formData.unpaidBreaks![index].hours > 0 ? formData.unpaidBreaks![index].hours : ''" @input="
                (event) => {
                  const value = Number((event.target as HTMLInputElement).value);
                  formData.unpaidBreaks![index].hours = Math.min(value, 24);
                }
              " step="1" min="0" max="24" />
          </ComboBox>

          <!-- Minutes (0, 15, 30, 45) -->
          <ComboBox @update:value="
            (minutes) => {
              !isNaN(Number(minutes))
                ? (formData.unpaidBreaks![index].minutes = Number(minutes))
                : alert('Invalid input: Please enter a valid number.');
            }
          " :list="[...Array(4).keys()].map((i) => (i * 15).toString())">
            <input type="number" name="unpaidBreak-minutes" placeholder="minutes"
              :value="formData.unpaidBreaks![index].minutes > 0 ? formData.unpaidBreaks![index].minutes : ''" @input="
                (event) => {
                  const value = Number((event.target as HTMLInputElement).value);
                  formData.unpaidBreaks![index].minutes = Math.min(value, 59);
                }
              " step="1" min="0" max="59" />
          </ComboBox>

          <!-- Delete unpaid break -->
          <button class="delete-btn danger" type="button" @click="formData.unpaidBreaks?.splice(index, 1)">
            <div class="icons8-close"></div>
          </button>
        </div>

        <!-- Add unpaid break -->
        <button type="button" class="add-item-btn" @click="addUnpaidBreak">+</button>
      </div>
    </div>

    <!-- ── Repeat (Recurring) ── -->
    <div v-if="action === 'add' || action === 'check in/out'" class="form-section">
      <span class="section-label">Repeat</span>

      <div class="repeat-inputs">
        <div class="repeat-quick-btns" role="radiogroup" aria-label="Repeat Presets">
          <label v-for="preset in [
            { val: 'none', label: 'None' },
            { val: '1d', label: 'Daily' },
            { val: '1w', label: 'Weekly' },
            { val: '1m', label: 'Monthly' },
            { val: 'custom', label: 'Custom' }
          ]" :key="preset.val" class="chip btn repeat-chip" :class="{ active: repeatPreset === preset.val }"
            tabindex="0">
            <input type="radio" name="repeat-preset" :value="preset.val" v-model="repeatPreset"
              @change="setRepeatPreset(preset.val as 'none' | '1d' | '1w' | '1m' | 'custom')" style="display:none;" />
            <span class="name">{{ preset.label }}</span>
          </label>
        </div>

        <fieldset v-if="repeatPreset === 'custom'" class="repeat-every">
          <legend>Repeat Every</legend>
          <label for="repeat-day" id="repeat-day-label">
            Day(s)
            <input type="number" ref="repeat-day" id="repeat-day" name="repeatDay" placeholder="Day" min="0" max="31" />
          </label>
          <label for="repeat-month" id="repeat-month-label">
            Month(s)
            <input type="number" ref="repeat-month" id="repeat-month" name="repeatMonth" placeholder="Month" min="0"
              max="12" />
          </label>
          <label for="repeat-year" id="repeat-year-label">
            Year(s)
            <input type="number" ref="repeat-year" id="repeat-year" name="repeatYear" placeholder="Year" min="0" />
          </label>
        </fieldset>

        <label v-if="repeatPreset != 'none'" for="repeat-end-date" id="repeat-end-date-label">
          End Date
          <input type="date" ref="repeat-end-date" id="repeat-end-date" name="repeatEndDate" required />
        </label>
      </div>
    </div>

    <div ref="actionBar" class="actions">
      <!-- Edit -->
      <template v-if="action == 'edit'">
        <ButtonConfirm type="submit" name="action" value="delete"
          :class="['danger', { focus: currentAction === 'delete' }]" id="delete-shift-btn" formnovalidate
          :disabled="shiftsStore.status === STATUS.Loading">
          <span v-if="currentAction === 'delete' && shiftsStore.status === STATUS.Loading"
            class="button-spinner"></span>
          {{ currentAction === 'delete' && shiftsStore.status === STATUS.Loading ? 'Deleting...' : 'Delete' }}
        </ButtonConfirm>

        <button type="submit" name="action" value="edit" :class="['warning', { focus: currentAction === 'edit' }]"
          id="edit-shift-btn" :disabled="shiftsStore.status === STATUS.Loading">
          <span v-if="currentAction === 'edit' && shiftsStore.status === STATUS.Loading" class="button-spinner"></span>
          {{ currentAction === 'edit' && shiftsStore.status === STATUS.Loading ? 'Saving...' : 'Edit Shift' }}
        </button>
      </template>

      <!-- Add, Check in/out -->
      <template v-else>
        <ButtonConfirm v-if="action == 'check in/out'" type="submit" name="action" value="remove check in"
          :class="['danger', { focus: currentAction === 'remove check in' }]" id="remove-check-in-out-btn"
          formnovalidate>
          Remove
        </ButtonConfirm>

        <button v-if="isEditingTemplate" type="submit" name="action" value="edit template"
          :class="['warning', { focus: currentAction === 'edit template' }]" id="edit-template-btn"
          :disabled="shiftTemplatesStore.status === STATUS.Loading">
          <span v-if="currentAction === 'edit template' && shiftTemplatesStore.status === STATUS.Loading"
            class="button-spinner"></span>
          {{ currentAction === 'edit template' && shiftTemplatesStore.status === STATUS.Loading ?
            'Saving...' : 'Edit Template' }}
        </button>

        <button type="submit" name="action" value="add"
          :class="['primary', { focus: currentAction === 'add', active: saveShiftTemplate }]" id="add-shift-btn"
          :disabled="shiftsStore.status === STATUS.Loading">
          <span v-if="currentAction === 'add' && shiftsStore.status === STATUS.Loading" class="button-spinner"></span>
          {{ currentAction === 'add' && shiftsStore.status === STATUS.Loading ?
            'Adding...' :
            (saveShiftTemplate ? 'Save & ' : '') + 'Add Shift' }}
        </button>
      </template>
    </div>
  </form>
</template>

<style scoped>
form {
  gap: calc(var(--padding) * 2);
  position: relative;
}

/* ── Section cards ── */
.form-section {
  display: flex;
  flex-direction: column;
  gap: calc(var(--padding) * 1.2);
  border-left: 2px solid light-dark(rgba(71, 172, 255, 0.3), rgba(71, 172, 255, 0.25));
  padding: 0.3em 0.4em 0.3em 0.7em;
}

.section-label {
  font-size: 0.65em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary-color);
  user-select: none;
}

/* ── Shift template chips ── */
.shift-templates,
.repeat-quick-btns {
  position: relative;
  display: flex;
  height: fit-content;
  box-sizing: border-box;
  overflow-x: auto;
  white-space: nowrap;
  gap: 0.5em;
  padding: 0.20em;
  -webkit-overflow-scrolling: touch;
}

.chip {
  min-width: fit-content;
  background-color: light-dark(rgba(255, 255, 255, 0.55), rgba(24, 24, 24, 0.75)) !important;
  cursor: pointer;
  transition: outline var(--transition-duration);
  outline: 2px solid var(--input-background-color);
  font-size: small;
  font-weight: bold;
  height: 3em;
  box-sizing: border-box;
  padding: var(--padding-small) calc(var(--padding) * 2);
}

.chip:focus,
.chip:hover {
  outline-color: var(--text-color-faded);
}

.chip:has(input[type='radio']:checked) {
  outline-color: var(--primary-color);
}

.chip:active {
  outline-color: var(--primary-color);
  transform: scale(0.97);
}

.chip.delete {
  outline: 2px dashed var(--danger-color);
  outline-offset: -1.5px;
}

.chip--delete:hover {
  outline: 2px solid var(--danger-color);
  background: var(--danger-color);
  opacity: 1;
}

#save-shift-template-btn.active,
#add-shift-btn.active {
  background-color: var(--success-color) !important;
  color: var(--text-color-black);
  border-color: transparent;
}

/* ── Time row (From / To) ── */
.time-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: calc(var(--padding) * 1.2);
}

/* ── Unpaid breaks ── */
.unpaid-breaks {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5em;
}

.unpaid-break {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: stretch;
  gap: var(--padding-small);
}

.unpaid-break>* {
  flex: 1;
}

.unpaid-break .delete-btn {
  flex-grow: 0;
  box-sizing: border-box;
  box-shadow: none;
}

.unpaid-break .delete-btn:hover {
  box-shadow: none;
}

.add-item-btn {
  background: transparent;
  border: 2px dashed light-dark(rgba(71, 172, 255, 0.4), rgba(71, 172, 255, 0.35));
  box-shadow: none;
  color: var(--primary-color);
  font-weight: bold;
  font-size: larger;
  padding: 0;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.add-item-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  box-shadow: none;
  opacity: 1;
}

/* ── Repeat ── */
.repeat-inputs {
  display: flex;
  flex-direction: column;
  gap: var(--padding);
}

.repeat-btn {
  background: var(--input-background-color);
  border: 1px solid var(--primary-color);
  color: var(--primary-color);
  border-radius: 4px;
  padding: 0.2em 0.8em;
  font-size: 0.95em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.repeat-btn:hover {
  background: var(--primary-color);
  color: var(--text-color-black);
}

.repeat-every {
  display: flex;
  flex-direction: row;
  gap: var(--padding);
  border-radius: var(--border-radius);
}

.repeat-every #repeat-year {
  flex: 2;
}

/* ── Spinner ── */
.button-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 0.5em;
  vertical-align: middle;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Mobile optimizations ── */
input[type='datetime-local'] {
  min-width: 0;
}

@media (max-width: 360px) {
  .form-section {
    padding: 0.2em 0.2em 0.2em 0.5em;
  }

  .template-chip-name {
    font-size: 0.8em;
  }
}
</style>