<script lang="ts">
import Shift from '@/models/Shift';
import Duration from '@/models/Duration';
import type { WorkProfile, PayRateOption } from '@/models/WorkInfo';
import { currencyFormat, deepClone } from '@/utils';
import { STATUS } from '@/types';

import { mapStores } from 'pinia';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import BaseDialog from './BaseDialog.vue';
import ButtonConfirm from './ButtonConfirm.vue';
import ComboBox from './ComboBox.vue';
import InputLabel from './InputLabel.vue';

function createInitialData(
  shift: Partial<Shift>
) {
  return {
    STATUS,
    formData: deepClone<Partial<Shift>>({
      id: shift.id,
      workplace: shift.workplace,
      payRate: shift.payRate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      unpaidBreaks: shift.unpaidBreaks,
      ...workDetails(shift)
    }),
    saveShiftTemplate: false,
    deleteShiftTemplate: false,
    repeatPreset: 'none',
    templateName: '',
    hiddenElements: [] as Element[], // Elements to hide when holding a button in action bar
    currentAction: '', // Track the current action being performed for loading state
  };
}

function workDetails(shift: Partial<Shift>) {
  return {
    workProfileId: shift.workProfileId,
    payRateId: shift.payRateId,
    position: shift.position,
    location: shift.location,
    payRateName: shift.payRateName
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
    ...mapStores(useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore),

    isEditingTemplate(): boolean {
      return this.saveShiftTemplate && this.shiftTemplatesStore.templates.has(this.templateName);
    },

    workProfiles(): WorkProfile[] {
      return this.workInfosStore.workInfos.get(this.formData.workplace ?? '')?.profiles ?? [];
    },

    selectedProfile(): WorkProfile | undefined {
      return this.workProfiles.find((profile) => profile.id === this.formData.workProfileId);
    },

    payRateOptions(): PayRateOption[] {
      return this.selectedProfile?.payRates ?? [];
    },

    savedProfileChanged(): boolean {
      const hasDetails = Boolean(this.formData.workProfileId || this.formData.position || this.formData.location);
      return hasDetails && (!this.selectedProfile ||
        (this.selectedProfile.position ?? '') !== (this.formData.position ?? '') ||
        (this.selectedProfile.location ?? '') !== (this.formData.location ?? ''));
    },

    savedRateChanged(): boolean {
      if (!this.formData.payRateId) return false;
      const rate = this.payRateOptions.find((option) => option.id === this.formData.payRateId);
      return !rate || rate.hourlyRate !== this.formData.payRate || rate.name !== (this.formData.payRateName ?? '');
    },

    unpaidBreakHourOptions(): string[] {
      const { startTime, endTime, unpaidBreaks } = this.formData;
      if (!startTime || !endTime) return ['0'];
      const breakMinutes = (unpaidBreaks ?? []).reduce((total, duration) => total + duration.hours * 60 + duration.minutes, 0);
      const billableMinutes = (endTime.getTime() - startTime.getTime()) / 60000 - breakMinutes;
      const hours = Number.isFinite(billableMinutes) ? Math.max(0, Math.floor(billableMinutes / 60)) : 0;
      return Array.from({ length: Math.min(hours, 24) + 1 }, (_, hour) => String(hour));
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

    profileLabel(profile: Pick<WorkProfile, 'position' | 'location'>, index?: number): string {
      return [profile.position, profile.location].filter(Boolean).join(' · ') ||
        (index === undefined ? 'General' : `Profile ${index + 1}`);
    },

    rateLabel(rate: Pick<PayRateOption, 'name' | 'hourlyRate'>): string {
      return `${rate.name ? `${rate.name} — ` : ''}${currencyFormat(rate.hourlyRate)}/h`;
    },

    changeWorkplace(workplace: string) {
      if (workplace === this.formData.workplace) return;
      this.formData.workplace = workplace;
      this.selectProfile('');
      if (this.workProfiles.length === 1) {
        this.selectProfile(this.workProfiles[0].id);
      }
    },

    selectProfile(profileId: string) {
      if (profileId === '__saved') return;
      const profile = this.workProfiles.find((option) => option.id === profileId);
      this.formData.workProfileId = profile?.id;
      this.formData.position = profile?.position;
      this.formData.location = profile?.location;
      this.formData.payRateId = undefined;
      this.formData.payRateName = undefined;
      this.formData.payRate = undefined;
      if (profile?.payRates.length === 1) {
        this.selectPayRate(profile.payRates[0].id);
      }
    },

    selectPayRate(rateId: string) {
      if (rateId === '__saved') return;
      const rate = this.payRateOptions.find((option) => option.id === rateId);
      this.formData.payRateId = rate?.id;
      this.formData.payRateName = rate?.name || undefined;
      if (rate) this.formData.payRate = rate.hourlyRate;
    },

    customRateChanged() {
      this.formData.payRateId = undefined;
      this.formData.payRateName = undefined;
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
        ...workDetails(shift),
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
          ...workDetails(this.formData),
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
                  ...workDetails(shift),
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
            this.workInfosStore.add(shift.workplace, shift.payRate, shift.workProfileId).catch((error) => {
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
      Object.assign(this.formData, workDetails(shift));

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
    BaseDialog,
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
              @update:value="changeWorkplace" :list="Array.from(workInfosStore.workInfos.keys())">
              <input type="search" id="workplace" name="workplace" placeholder="e.g. Company Name"
                :value="formData.workplace" @input="changeWorkplace(($event.target as HTMLInputElement).value)" required />
            </ComboBox>
          </InputLabel>

          <InputLabel v-if="workProfiles.length || savedProfileChanged" label-text="Position / location" for-id="work-profile">
            <select id="work-profile" aria-label="Position and location"
              :value="savedProfileChanged ? '__saved' : formData.workProfileId ?? ''"
              @change="selectProfile(($event.target as HTMLSelectElement).value)">
              <option v-if="savedProfileChanged" value="__saved">
                Saved: {{ profileLabel(formData) }}
              </option>
              <option value="">Choose a profile (optional)</option>
              <option v-for="(profile, index) in workProfiles" :key="profile.id" :value="profile.id">
                {{ profileLabel(profile, index) }}
              </option>
            </select>
          </InputLabel>

          <InputLabel v-if="payRateOptions.length || savedRateChanged" label-text="Saved pay rates" for-id="saved-pay-rate">
            <select id="saved-pay-rate" aria-label="Saved pay rates"
              :value="savedRateChanged ? '__saved' : formData.payRateId ?? ''"
              @change="selectPayRate(($event.target as HTMLSelectElement).value)">
              <option v-if="savedRateChanged" value="__saved">
                Saved: {{ rateLabel({ name: formData.payRateName ?? '', hourlyRate: formData.payRate ?? 0 }) }}
              </option>
              <option value="">Custom hourly rate</option>
              <option v-for="rate in payRateOptions" :key="rate.id" :value="rate.id">{{ rateLabel(rate) }}</option>
            </select>
          </InputLabel>

          <InputLabel label-text="Hourly rate" for-id="pay-rate" :loading="workInfosStore.status === STATUS.Loading">
            <input type="number" id="pay-rate" name="payRate" placeholder="e.g. 23.23" v-model.number="formData.payRate"
              @input="customRateChanged" min="0" step="0.01" required />
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
            " :list="unpaidBreakHourOptions">
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

#job-details select {
  width: 100%;
  min-width: 0;
  padding: var(--padding);
  font: inherit;
  color: var(--text-color);
  background: var(--input-background-color);
  border: 0;
  border-radius: var(--border-radius);
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
