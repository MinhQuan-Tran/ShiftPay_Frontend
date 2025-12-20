<script lang="ts">
import Shift from '@/models/Shift';
import { currencyFormat, toTimeStr } from '@/utils';
import { STATUS } from '@/types';

import { mapStores } from 'pinia';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import DayScheduleShift from '@/components/DayScheduleShiftCard.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import ClearShiftsForm from '@/components/ClearShiftsForm.vue';
import ShiftForm from '@/components/ShiftForm.vue';
import LoadingOverlay from '@/components/LoadingOverlay.vue';

export default {
  props: {
    selectedDate: {
      type: Date,
      required: true
    }
  },

  data() {
    return {
      STATUS,
      selectedShift: undefined as Shift | undefined,
      shiftFormData: {
        title: 'Shift',
        resetForm: true, // Reset the form when the dialog is closed
        action: '',
        placeholderShift: undefined as
          | {
            id?: string;
            workplace?: string;
            payRate?: number;
            startTime?: Date;
            endTime?: Date;
          }
          | undefined
      },
      datetimeWidth: 'auto',
    };
  },

  components: { DayScheduleShift, BaseDialog, ClearShiftsForm, ShiftForm, LoadingOverlay },

  methods: {
    currencyFormat,
    toTimeStr,

    handleEditShift(shift: Shift) {
      this.selectedShift = shift;
      this.shiftFormData = {
        title: 'Edit Shift',
        resetForm: true,
        action: 'edit',
        placeholderShift: this.selectedShift
      };
      (this.$refs.shiftDialog as any).showModal();
    },

    handleCheckInOut() {
      // If not checked in
      if (!this.shiftSessionStore.isInProgress) {
        // Check in
        this.shiftSessionStore.set();
        return;
      }

      if (isNaN(this.shiftSessionStore.startTime!.getTime())) {
        if (confirm('Invalid check in time. Do you want to remove it?')) {
          this.shiftSessionStore.clear();
        }
        return;
      }

      // Check out
      this.shiftFormData = {
        title: 'Check Out',
        resetForm: false,
        action: 'check in/out',
        placeholderShift: {
          startTime: this.shiftSessionStore.startTime,
          endTime: new Date()
        }
      };

      (this.$refs.shiftDialog as any).showModal();
    },

    handleAddShift() {
      this.shiftFormData = {
        title: 'Add Shift',
        resetForm: false,
        action: 'add',
        placeholderShift: {
          // Set the startTime and endTime time to the selected date with the current time
          startTime: new Date(new Date(this.selectedDate).setHours(new Date().getHours(), new Date().getMinutes())),
          endTime: new Date(new Date(this.selectedDate).setHours(new Date().getHours(), new Date().getMinutes()))
        }
      };
      (this.$refs.shiftDialog as any).showModal();
    },

    updateTimeWidth() {
      this.datetimeWidth = 'auto';

      this.$nextTick(() => {
        this.datetimeWidth =
          Math.max(...Array.from(document.querySelectorAll('.shift .datetime > *')).map((time) => time.clientWidth)) +
          'px';
      });
    }
  },

  computed: {
    ...mapStores(useShiftsStore, useShiftSessionStore),
  },

  mounted() {
    this.updateTimeWidth();
  },

  updated() {
    this.updateTimeWidth();
  },
};
</script>

<template>
  <div class="day-schedule">
    <div class="actions">
      <button @click="($refs.clearShiftsDialog as any).showModal()" class="danger" id="clear-btn">Clear</button>

      <Transition>
        <button v-if="selectedDate.setHours(0, 0, 0, 0) == new Date().setHours(0, 0, 0, 0)" @click="handleCheckInOut"
          id="check-in-out-btn"
          :class="{ primary: !shiftSessionStore.isInProgress, warning: shiftSessionStore.isInProgress }">
          {{ shiftSessionStore.isInProgress ? 'End' : 'Start' }} Shift
        </button>
      </Transition>

      <button @click="handleAddShift" class="success" id="add-btn">Add Shift</button>
    </div>

    <div class="shift-list">
      <DayScheduleShift v-for="shift in shiftsStore.day(selectedDate).sort((a, b) => {
        // Sort by startTime, then by endTime
        return a.startTime.getTime() - b.startTime.getTime() || a.endTime.getTime() - b.endTime.getTime();
      })" :key="shift.id" :shift="(shift as Shift)" :selected-date="selectedDate" @edit-shift="handleEditShift" />
    </div>

    <BaseDialog ref="clearShiftsDialog" title="Clear Shifts" open-dialog-text="Clear" class="danger"
      :reset-forms="true">
      <ClearShiftsForm :selected-date="selectedDate" />
    </BaseDialog>

    <BaseDialog ref="shiftDialog" :title="shiftFormData.title" :reset-forms="shiftFormData.resetForm">
      <ShiftForm :selected-date="selectedDate" :shift="shiftFormData.placeholderShift" :action="shiftFormData.action" />
    </BaseDialog>

    <LoadingOverlay :active="shiftsStore.status === STATUS.Loading" />
  </div>
</template>

<style scoped>
.day-schedule {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--gap-horizontal);
  margin: var(--padding-small) 0;
}

.actions>* {
  flex: 1;
  text-wrap: nowrap;
}

.actions #clear-btn {
  flex-grow: 0;
}

.actions #check-in-out-btn {
  overflow: hidden;
  flex-grow: 10;
}

.actions #check-in-out-btn.v-enter-from,
.actions #check-in-out-btn.v-leave-to {
  flex-grow: 0;
  width: 0;
}

.shift-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin: var(--padding) 0;
  gap: calc(var(--padding) * 2);
}

.shift-list:has(.info[open]) .shift:not(:has(.info[open]), :hover) {
  opacity: 0.5;
}

.shift-list {
  --datetime-width: v-bind('datetimeWidth');
}
</style>
