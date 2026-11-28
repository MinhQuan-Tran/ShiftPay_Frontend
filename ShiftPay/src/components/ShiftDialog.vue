<script lang="ts">
import Shift from '@/models/Shift';
import Duration from '@/models/Duration';
import { amountFromConverted, currencyFormat, deepClone, payRateFromTotal, totalFromPayRate } from '@/utils';
import { STATUS } from '@/types';

import { mapStores } from 'pinia';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';
import { useCurrencyStore } from '@/stores/currencyStore';

import BaseDialog from './BaseDialog.vue';
import ButtonConfirm from './ButtonConfirm.vue';
import ComboBox from './ComboBox.vue';
import InputLabel from './InputLabel.vue';

function createInitialData(
  shift: Partial<Shift>
) {
  return {
    STATUS,
    formData: deepClone<Partial<Shift>>(shift),
    saveShiftTemplate: false,
    deleteShiftTemplate: false,
    repeatPreset: 'none',
    templateName: '',
    hiddenElements: [] as Element[], // Elements to hide when holding a button in action bar
    currentAction: '', // Track the current action being performed for loading state
    payRateDraft: null as string | null, // What the user is typing in Pay Rate (shown as-is until the field loses focus)
    totalDraft: null as string | null, // What the user is typing in Total (shown as-is until the field loses focus)
  };
}

export default {
  name: 'ShiftDialog',
  props: {
    title: {
      type: String,
      default: 'Shift'
    },
    resetForms: {
      type: Boolean,
      default: false
    },
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
    return createInitialData(this.shift);
  },

  computed: {
    ...mapStores(useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore, useCurrencyStore),

    isEditingTemplate(): boolean {
      return this.saveShiftTemplate && this.shiftTemplatesStore.templates.has(this.templateName);
    },

    // Value sent by the Add Shift button; 'check in' (dialog opened from End Shift) also clears the clock-in session
    submitAction(): 'add' | 'check in' {
      return this.action === 'check in/out' ? 'check in' : 'add';
    },

    // Shift length in whole minutes (same rounding as Shift.duration)
    workedMinutes(): number {
      const start = this.formData.startTime ? new Date(this.formData.startTime).getTime() : NaN;
      const end = this.formData.endTime ? new Date(this.formData.endTime).getTime() : NaN;
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;

      return Math.floor((end - start) / (1000 * 60));
    },

    unpaidBreakMinutes(): number {
      return (this.formData.unpaidBreaks ?? []).reduce(
        (sum: number, unpaidBreak: Duration) =>
          sum + (Number(unpaidBreak.hours) || 0) * 60 + (Number(unpaidBreak.minutes) || 0),
        0
      );
    },

    // Worked minutes after unpaid breaks, never negative
    billableMinutes(): number {
      return Math.max(0, this.workedMinutes - this.unpaidBreakMinutes);
    },

    billableDurationLabel(): string {
      if (this.billableMinutes === 0) return '';

      const duration = new Duration({ minutes: this.billableMinutes });
      try {
        return duration.format();
      } catch {
        // Intl.DurationFormat isn't available in older browsers; don't break the form over a label
        return `${duration.hours}h ${duration.minutes}m`;
      }
    },

    // Total pay, always derived from the pay rate (the pay rate is what gets saved)
    formTotal(): number | undefined {
      if (this.billableMinutes === 0) return undefined;
      return totalFromPayRate(this.formData.payRate, this.billableMinutes);
    },

    // Pay Rate and Total are shown and typed in the currency picked in the menu,
    // but saved in the pay currency (AUD). 1 when no other currency is picked.
    conversionRate(): number {
      return this.currencyStore.convert(1);
    },

    // An hourly rate's rounding error is multiplied by the shift's hours, so keep enough precision
    // for the total to round correctly even for a full day (or the current shift, if longer).
    hourlyRateTolerance(): number {
      return this.currencyStore.tolerance / Math.max(24, this.billableMinutes / 60);
    },

    // Changes when amounts start being shown in another currency or at another rate
    conversionKey(): string {
      return `${this.currencyStore.activeCurrency}:${this.conversionRate}`;
    },

    // e.g. "$" for AUD in Australia, "USD", "₫"
    formCurrencySymbol(): string {
      return this.currencyStore.symbol;
    },

    payRateInputValue(): string {
      if (this.payRateDraft !== null) return this.payRateDraft;

      const payRate = this.formData.payRate as unknown;
      if (payRate === undefined || payRate === null || payRate === '' || Number.isNaN(Number(payRate))) return '';

      return this.formatPayRate(Number(payRate));
    },

    // Saved pay rates for the workplace, labelled in the form's currency
    payRateOptions(): Array<{ label: string; value: number }> {
      const payRates = this.formData.workplace
        ? this.workInfosStore.workInfos.get(this.formData.workplace)?.payRates
        : undefined;

      return Array.from(payRates ?? []).map((payRate) => ({ label: this.formatPayRate(payRate), value: payRate }));
    },

    totalInputValue(): string {
      if (this.totalDraft !== null) return this.totalDraft;
      if (this.formTotal === undefined) return '';

      return this.currencyStore.convert(this.formTotal).toFixed(this.currencyStore.fractionDigits);
    },

    // When converting, what actually gets saved, e.g. "Saved in AUD: $301.20"
    savedTotalHint(): string {
      if (!this.currencyStore.isConverting || this.formTotal === undefined) return '';

      const base = this.currencyStore.baseCurrency;
      return `Saved in ${base}: ${currencyFormat(this.formTotal, base, {}, this.currencyStore.symbolPosition)}`;
    },

    // "20$" instead of "$20" (menu > Symbol Position)
    symbolAfter(): boolean {
      return this.currencyStore.symbolPosition === 'after';
    },

    // e.g. "7h 20m after unpaid breaks × $27.2727/h"
    totalBreakdown(): string {
      if (this.billableMinutes === 0) return '';

      let breakdown = this.billableDurationLabel;
      if (this.unpaidBreakMinutes > 0) breakdown += ' after unpaid breaks';

      if (this.formTotal !== undefined) {
        const digits = this.currencyStore.fractionDigits;
        const payRate = currencyFormat(
          this.currencyStore.convert(Number(this.formData.payRate)),
          this.currencyStore.activeCurrency,
          { minimumFractionDigits: digits, maximumFractionDigits: digits + 2 },
          this.currencyStore.symbolPosition
        );
        breakdown += ` × ${payRate}/h`;
      }

      return breakdown;
    },
  },

  emits: {
    shiftChange(payload: { action: string; shift: Shift; }) {
      const actions = ['add', 'edit', 'delete', 'check in/out'];
      return actions.includes(payload.action);
    }
  },

  methods: {
    showModal() {
      (this.$refs.baseDialog as HTMLDialogElement).showModal();
    },

    close() {
      (this.$refs.baseDialog as HTMLDialogElement).close();
    },

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
        throw new Error('Unable to parse form data into Shift object', { cause: error });
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
              const repeatWeek = Number((this.$refs['repeat-week'] as HTMLInputElement)?.value) || 0;
              const repeatMonth = Number((this.$refs['repeat-month'] as HTMLInputElement)?.value) || 0;
              const repeatYear = Number((this.$refs['repeat-year'] as HTMLInputElement)?.value) || 0;

              if (repeatDay === 0 && repeatWeek === 0 && repeatMonth === 0 && repeatYear === 0) {
                const repeatDay = this.$refs['repeat-day'] as HTMLFieldSetElement;

                repeatDay.setCustomValidity('Please enter a valid repeat interval.');
                repeatDay.reportValidity();
                return false;
              }

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
                currentFromDate.setDate(currentFromDate.getDate() + repeatWeek * 7);
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
      Object.assign(this.$data, createInitialData(this.shift));
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

    // A pay rate (saved in AUD) as shown in the form's currency
    formatPayRate(payRate: number): string {
      if (!this.currencyStore.isConverting) return String(payRate);

      // A couple of extra decimals so the converted rate isn't misleadingly rounded
      const converted = this.currencyStore.convert(payRate);
      return String(Number(converted.toFixed(this.currencyStore.fractionDigits + 2)));
    },

    onPayRateInput(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      this.payRateDraft = value;

      if (value.trim() === '') {
        // Same as clearing the box with v-model before
        this.formData.payRate = '' as unknown as number;
        return;
      }

      const payRate = this.currencyStore.isConverting
        ? amountFromConverted(Number(value), this.conversionRate, this.hourlyRateTolerance)
        : Number(value);

      if (payRate !== undefined && !Number.isNaN(payRate)) {
        this.formData.payRate = payRate;
      }
    },

    onPayRateBlur() {
      this.payRateDraft = null;
    },

    // Picked from the saved pay rates: use the exact saved value, not a converted round trip
    selectPayRate(label: string) {
      const option = this.payRateOptions.find((payRate) => payRate.label === label);
      if (!option) return;

      this.payRateDraft = null;
      this.formData.payRate = option.value;
    },

    deletePayRate(label: string) {
      const option = this.payRateOptions.find((payRate) => payRate.label === label);
      if (!option || !this.formData.workplace) return;

      this.workInfosStore
        .delete(this.formData.workplace, option.value)
        .catch((error) => alert('Failed to delete pay rate \n' + error.message));
    },

    // Typing a total works out the pay rate for the current billable time
    onTotalInput(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      this.totalDraft = value;

      if (value.trim() === '') return;

      const payRate = payRateFromTotal(
        Number(value),
        this.billableMinutes,
        this.conversionRate,
        this.currencyStore.tolerance
      );
      if (payRate !== undefined) {
        this.formData.payRate = payRate;
      }
    },

    onTotalBlur() {
      this.totalDraft = null;
    },

    addUnpaidBreak() {
      if (!this.formData.unpaidBreaks) {
        this.formData.unpaidBreaks = [] as Duration[];
      }

      this.formData.unpaidBreaks.push(new Duration());
    }
  },

  components: {
    BaseDialog,
    ButtonConfirm,
    ComboBox,
    InputLabel
  },

  watch: {
    shift() {
      this.resetForm();
    },

    // If the currency or rate changes mid-edit (e.g. rates finish loading), a half-typed number would
    // keep showing the old currency's amount. Drop the drafts so both boxes show what will be saved.
    conversionKey() {
      this.payRateDraft = null;
      this.totalDraft = null;
    }
  }
};
</script>

<template>
  <BaseDialog ref="baseDialog" :title="title" :reset-forms="resetForms">
    <form @submit.prevent="shiftAction" @reset.prevent="resetForm" ref="shiftForm">
      <input type="hidden" name="id" v-model="formData.id" />

      <!-- ── Shift Templates ── -->
      <div v-if="action === 'add'" class="form-section" id="shift-templates">
        <label>Templates</label>

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
      <div class="form-section" id="job-details">
        <label>Job Details</label>

        <div class="content">
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
            <ComboBox :value="payRateInputValue" @update:value="selectPayRate"
              :list="payRateOptions.map((payRate) => payRate.label)" @delete-item="deletePayRate" deletable>
              <div :class="['money-input', { 'symbol-after': symbolAfter }]">
                <span class="currency-symbol" aria-hidden="true">{{ formCurrencySymbol }}</span>
                <input type="number" id="pay-rate" name="payRate" placeholder="e.g. 23.23" :value="payRateInputValue"
                  @input="onPayRateInput" @blur="onPayRateBlur"
                  :aria-label="`Pay rate in ${currencyStore.activeCurrency} per hour`" step="any" min="0" required />
              </div>
            </ComboBox>
          </InputLabel>

        </div>
      </div>

      <!-- ── Schedule ── -->
      <div class="form-section" id="schedule">
        <label>Schedule</label>

        <div class="content">
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
      <div class="form-section" id="unpaid-breaks">
        <label>Unpaid Breaks</label>

        <div class="content">
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

      <!-- ── Total ── -->
      <!-- Bound to Pay Rate: Total = Pay Rate × hours after unpaid breaks; editing Total works out the Pay Rate -->
      <div class="form-section" id="total">
        <label for="total-pay">Total</label>

        <div class="content">
          <div :class="['money-input', { 'symbol-after': symbolAfter, disabled: billableMinutes === 0 }]">
            <span class="currency-symbol" aria-hidden="true">{{ formCurrencySymbol }}</span>
            <input type="number" id="total-pay" :value="totalInputValue" @input="onTotalInput" @blur="onTotalBlur"
              :placeholder="billableMinutes === 0 ? 'Set times first' : 'e.g. 185.84'" :disabled="billableMinutes === 0"
              :title="billableMinutes === 0 ? 'Set the start and end time first' : 'Total pay after unpaid breaks. Changing it updates the pay rate.'"
              :aria-label="`Total pay in ${currencyStore.activeCurrency}`" step="any" min="0" inputmode="decimal" />
          </div>

          <small v-if="totalBreakdown" class="field-hint total-breakdown">{{ totalBreakdown }}</small>
          <small v-if="savedTotalHint" class="field-hint saved-total">{{ savedTotalHint }}</small>
        </div>
      </div>

      <!-- ── Repeat (Recurring) ── -->
      <div v-if="action === 'add' || action === 'check in/out'" class="form-section" id="repeat">
        <label>Repeat</label>

        <div class="content">
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
              <input type="number" ref="repeat-day" id="repeat-day" name="repeatDay" placeholder="Day" min="0"
                max="365" />
            </label>
            <label for="repeat-week" id="repeat-week-label">
              Week(s)
              <input type="number" ref="repeat-week" id="repeat-week" name="repeatWeek" placeholder="Week" min="0"
                max="52" />
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
            <span v-if="currentAction === 'edit' && shiftsStore.status === STATUS.Loading"
              class="button-spinner"></span>
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

          <!-- In check in/out mode this submits 'check in' so the clock-in session gets cleared -->
          <button type="submit" name="action" :value="submitAction"
            :class="['primary', { focus: currentAction === submitAction, active: saveShiftTemplate }]" id="add-shift-btn"
            :disabled="shiftsStore.status === STATUS.Loading">
            <span v-if="currentAction === submitAction && shiftsStore.status === STATUS.Loading"
              class="button-spinner"></span>
            {{ currentAction === submitAction && shiftsStore.status === STATUS.Loading ?
              'Adding...' :
              (saveShiftTemplate ? 'Save & ' : '') + 'Add Shift' }}
          </button>
        </template>
      </div>
    </form>
  </BaseDialog>
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

.form-section>label {
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

/* ── Job details ── */
#job-details .content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--padding) * 1.2);
}

/* ── Total ── */
#total .content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.money-input {
  display: flex;
  align-items: stretch;
  border-radius: var(--border-radius);
}

.money-input:focus-within {
  outline: 2px solid var(--primary-color);
}

.money-input .currency-symbol {
  display: flex;
  align-items: center;
  padding: 0 0 0 var(--padding);
  font-size: large;
  color: var(--text-color-faded);
  background-color: light-dark(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.07));
  border-bottom: 2px solid var(--primary-color);
  border-radius: var(--border-radius) 0 0 var(--border-radius);
  user-select: none;
}

.money-input input {
  min-width: 0;
  padding-left: var(--padding-small);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.money-input input:focus {
  outline: none;
}

/* Symbol after the amount: "20 $" */
.money-input.symbol-after .currency-symbol {
  order: 1;
  padding: 0 var(--padding) 0 0;
  border-radius: 0 var(--border-radius) var(--border-radius) 0;
}

.money-input.symbol-after input {
  text-align: right;
  padding-left: var(--padding);
  padding-right: var(--padding-small);
  border-radius: var(--border-radius) 0 0 var(--border-radius);
}

.money-input.disabled {
  opacity: 0.6;
}

.field-hint {
  display: block;
  font-size: small;
  color: var(--text-color-faded);
}

/* ── Schedule ── */
#schedule .content {
  display: grid;
  grid-template-columns: 1fr;
  gap: calc(var(--padding) * 1.2);
}

/* ── Unpaid breaks ── */
#unpaid-breaks .content {
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
#repeat .content {
  display: flex;
  flex-direction: column;
  gap: var(--padding);
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
