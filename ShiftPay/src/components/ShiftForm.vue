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
import LoadingOverlay from './LoadingOverlay.vue';

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
      recurringShift: false,
      shiftName: '',
      hiddenElements: [] as Element[] // Elements to hide when holding a button in action bar
    };
  },

  computed: {
    ...mapStores(useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore),
  },

  emits: {
    shiftChange(payload: { action: string; shift: Shift; }) {
      const actions = ['add', 'edit', 'delete', 'check in/out'];
      return actions.includes(payload.action);
    }
  },

  methods: {
    // Cannot use alert directly on event
    alert(message: string) {
      alert(message);
    },

    quickAddShift(shift: Shift) {
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

      this.shiftsStore.add(newShift);

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

    shiftAction(event: Event) {
      const form = event.currentTarget as HTMLFormElement;

      const action = ((event as SubmitEvent)?.submitter as HTMLButtonElement).value;

      // Match action with form data
      switch (action) {
        case 'add':
        case 'check in': {
          const shift = this.parseFormData();

          console.log('Adding shift:', shift);

          const newShifts: Shift[] = [];
          newShifts.push(shift);

          // Handle recurring shifts
          if (this.recurringShift) {
            const recurringDay = Number((this.$refs['recurring-day'] as HTMLInputElement)?.value);
            const recurringMonth = Number((this.$refs['recurring-month'] as HTMLInputElement)?.value);
            const recurringYear = Number((this.$refs['recurring-year'] as HTMLInputElement)?.value);

            const recurringEndDate = new Date(
              (this.$refs['recurring-end-date'] as HTMLInputElement)?.value ?? shift!.startTime
            );
            recurringEndDate.setHours(23, 59, 59, 999);

            const duration = shift!.endTime.getTime() - shift!.startTime.getTime();

            for (
              const currentFromDate = new Date(shift!.startTime);
              currentFromDate < recurringEndDate;
              // Skip the first shift as it's already added
            ) {
              // Increment the currentFromDate by the recurring interval
              currentFromDate.setDate(currentFromDate.getDate() + recurringDay);
              currentFromDate.setMonth(currentFromDate.getMonth() + recurringMonth);
              currentFromDate.setFullYear(currentFromDate.getFullYear() + recurringYear);

              const start = new Date(currentFromDate);
              const end = new Date(currentFromDate.getTime() + duration);

              const recurringShift = new Shift({
                workplace: shift!.workplace,
                payRate: shift!.payRate,
                startTime: start,
                endTime: end,
                unpaidBreaks: shift!.unpaidBreaks
              });

              newShifts.push(recurringShift);
            }
          }

          // Batch the reactive update (one change, multiple shifts) -> better performance
          this.shiftsStore.add(newShifts);

          // Add workplace and pay rate to workInfos
          this.workInfosStore.add(shift.workplace, shift.payRate);

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
          this.shiftsStore.update(shift.id, shift);

          break;
        }

        case 'delete':
          if (!this.formData || !this.formData.id) {
            alert('Invalid shift');
            throw new Error('Invalid shift');
          }

          this.shiftsStore.delete(this.formData.id);
          break;

        case 'remove check in':
          this.shiftSessionStore.clear();
          break;

        default:
          alert('Invalid action');
          throw new Error('Invalid action');
      }

      form.reset();

      const dialog = form.closest('dialog') as HTMLDialogElement;
      dialog?.close();
    },

    resetForm() {
      // https://stackoverflow.com/a/50854892
      if (this.$options.data) {
        Object.assign(this.$data, (this.$options.data as any).call(this, this));
      }
    },

    // For delete button hold
    focusButtonConfirm(isHolding: boolean) {
      if (isHolding) {
        // Hide all elements except this button and the bar
        return (this.$refs.actionBar as HTMLElement)
          ?.querySelectorAll('*:not(.slider:has(.button-confirm.active))')
          .forEach((el) => {
            this.hiddenElements.push(el);
            el.classList.add('hide');
          });
      }

      this.hiddenElements.forEach((el) => {
        el.classList.remove('hide');
      });
      this.hiddenElements = [];
    },

    toDateTimeLocal(date: Date | undefined) {
      if (!date) {
        return '';
      }

      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - offset * 60 * 1000);
      return localDate.toISOString().slice(0, 16);
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
    InputLabel,
    LoadingOverlay
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
    <LoadingOverlay :active="shiftsStore.status === STATUS.Loading ||
      workInfosStore.status === STATUS.Loading ||
      shiftTemplatesStore.status === STATUS.Loading
      " />
    <input type="hidden" name="id" v-model="formData.id" />

    <InputLabel label-text="Shift Templates" v-if="action === 'add'" v-model:toggle-value="deleteShiftTemplate"
      toggle-color="var(--danger-color)" sub-text="Delete">
      <div class="shift-templates">
        <button v-for="[name, template] in shiftTemplatesStore.templates" :key="name"
          @click="deleteShiftTemplate ? shiftTemplatesStore.delete(name) : quickAddShift(template as Shift)"
          type="button" class="shift-info">
          <div class="name">{{ name }}</div>
        </button>
        <button type="button" :class="['shift-info', { active: saveShiftTemplate }]" id="save-shift-template-btn"
          @click="saveShiftTemplate = !saveShiftTemplate">
          <div class="name">&nbsp;+&nbsp;</div>
        </button>
      </div>
    </InputLabel>

    <InputLabel label-text="Shift Name" for-id="shift-name" v-if="saveShiftTemplate">
      <input type="text" id="shift-name" name="shiftName" placeholder="e.g. McDonald | Delivery" v-model="shiftName"
        required />
    </InputLabel>

    <InputLabel label-text="Workplace" for-id="workplace">
      <ComboBox :value="formData?.workplace || ''"
        @update:value="newValue => { formData.workplace = newValue; formData.payRate = undefined; }"
        :list="Array.from(workInfosStore.workInfos.keys())" @delete-item="workInfo => workInfosStore.delete(workInfo)"
        deletable>
        <input type="search" id="workplace" name="workplace" placeholder="e.g. Company Name"
          v-model="formData.workplace" required />
      </ComboBox>
    </InputLabel>

    <InputLabel label-text="Pay Rate" for-id="pay-rate">
      <ComboBox :value="formData.payRate ? formData.payRate.toString() : ''"
        @update:value="(newValue: number | undefined) => (formData.payRate = Number(newValue))" :list="formData.workplace && workInfosStore.workInfos.get(formData.workplace)?.payRates
          ? Array.from(workInfosStore.workInfos.get(formData.workplace)?.payRates ?? []).map((pr) => pr.toString())
          : []
          "
        @delete-item="payRate => formData.workplace ? workInfosStore.delete(formData.workplace, Number(payRate)) : null"
        deletable>
        <input type="number" id="pay-rate" name="payRate" placeholder="e.g. 23.23" v-model="formData.payRate"
          step="0.01" min="0" max="1000" required />
      </ComboBox>
    </InputLabel>

    <InputLabel label-text="From" for-id="start-time">
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

    <InputLabel label-text="To" for-id="end-time">
      <input type="datetime-local" id="end-time" name="end-time" :value="toDateTimeLocal(formData.endTime)"
        :min="toDateTimeLocal(formData.startTime)"
        @input="(event) => (formData.endTime = new Date((event.target as HTMLInputElement).value))" required />
    </InputLabel>

    <InputLabel label-text="Unpaid Break(s)" for-id="unpaid-breaks">
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
        <button type="button" @click="addUnpaidBreak">+</button>
      </div>
    </InputLabel>

    <InputLabel v-if="action === 'add' || action === 'check in/out'" label-text="Recurring?" for-id="recurring"
      v-model:toggle-value="recurringShift">
      <div v-if="recurringShift" class="recurring-inputs">
        <span>Shift repeat every:</span>
        <input type="number" ref="recurring-day" id="recurring-day" name="recurringDay" placeholder="Day" min="0"
          max="31" />
        <input type="number" ref="recurring-month" id="recurring-month" name="recurringMonth" placeholder="Month"
          min="0" max="12" />
        <input type="number" ref="recurring-year" id="recurring-year" name="recurringYear" placeholder="Year" min="0" />
        <input type="date" ref="recurring-end-date" id="recurring-end-date" name="recurringEndDate" required />
      </div>
    </InputLabel>

    <div ref="actionBar" class="actions">
      <!-- Edit -->
      <template v-if="action == 'edit'">
        <ButtonConfirm @is-holding="focusButtonConfirm" type="submit" name="action" value="delete" class="danger"
          id="delete-shift-btn" formnovalidate>
          Delete
        </ButtonConfirm>
        <button type="submit" name="action" value="edit" class="warning" id="edit-shift-btn">Edit Shift</button>
      </template>

      <!-- Add, Check in/out -->
      <template v-else>
        <ButtonConfirm v-if="action == 'check in/out'" @is-holding="focusButtonConfirm" type="submit" name="action"
          value="remove check in" class="danger" id="remove-check-in-out-btn" formnovalidate>
          Remove
        </ButtonConfirm>

        <button type="submit" name="action" value="add" :class="['primary', { active: saveShiftTemplate }]"
          id="add-shift-btn">
          {{ saveShiftTemplate ? 'Save & ' : '' }}Add Shift
        </button>
      </template>
    </div>
  </form>
</template>

<style scoped>
form {
  gap: calc(var(--padding) * 1.5);
  position: relative;
}

.shift-templates {
  position: relative;
  display: flex;
  overflow-x: auto;
  white-space: nowrap;
  /* Prevent wrapping */
  gap: var(--padding-small);
  padding: var(--padding-small);
}

.shift-templates .shift-info {
  flex: 0 0 auto;
  /* Prevent buttons from shrinking or growing */
  background-color: var(--input-background-color);
  min-width: 80px;
}

#save-shift-template-btn.active,
#add-shift-btn.active {
  background-color: var(--success-color) !important;
  color: var(--text-color-black);
}

.actions {
  transition: all 0.3s ease;
}

.actions>* {
  max-width: 100%;
  overflow: hidden;
}

.actions button {
  flex: 1;
  transition: all 0.3s ease;
}

.actions .danger {
  flex-grow: 0;
}

.actions:has(.hide) {
  gap: 0;
}

.hide {
  max-width: 0;
  padding: 0;
}

.unpaid-breaks {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--padding-small);
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
}

.recurring-inputs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: auto;
  grid-template-areas:
    'text text text text'
    'day month year year'
    'end-date end-date end-date end-date';
  gap: var(--padding-small);
}

.recurring-inputs span {
  grid-area: text;
}

.recurring-inputs input#recurring-day {
  grid-area: day;
}

.recurring-inputs input#recurring-month {
  grid-area: month;
}

.recurring-inputs input#recurring-year {
  grid-area: year;
}

.recurring-inputs input#recurring-end-date {
  grid-area: end-date;
}
</style>
