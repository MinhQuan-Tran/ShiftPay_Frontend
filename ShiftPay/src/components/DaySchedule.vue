<script lang="ts">
import Shift from '@/models/Shift';
import { currencyFormat, toTimeStr } from '@/utils';
import { STATUS, type DateRange } from '@/types';

import { mapStores } from 'pinia';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import DayScheduleShiftCard from '@/components/DayScheduleShiftCard.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import ClearShiftsForm from '@/components/ClearShiftsForm.vue';
import ShiftForm from '@/components/ShiftForm.vue';
import LoadingOverlay from '@/components/LoadingOverlay.vue';

type EmptyShiftTone = 'pastOnly' | 'todayOnly' | 'futureOnly' | 'spansToday';
type EmptyShiftRange = 'day' | 'week' | 'month' | 'custom';
type EmptyShiftLinesByTone = Record<EmptyShiftTone, string[]>;

const EMPTY_SHIFT_RANGE_LINES: Record<EmptyShiftRange, EmptyShiftLinesByTone> = {
  day: {
    pastOnly: [
      'That day already clocked out with zero drama.',
      'Past-day report: no shifts, no chaos, just peace.',
      'Yesterday called and said there were still no clock-ins.'
    ],
    todayOnly: [
      'Today is empty and your alarm is taking it personally.',
      'Day view is clear. Your to-do list is just vibes.',
      'No shift today. The kettle is now your team lead.'
    ],
    futureOnly: [
      'That future day is open. Tomorrow-you can breathe.',
      'No shift on that day. Even the calendar looks relaxed.',
      'That day is blank enough to hear echoes.'
    ],
    spansToday: [
      'This 24-hour slice touches today and still nobody clocked in.',
      'Part today, part not, all empty.',
      'This day range has vibes but no timesheet action.'
    ]
  },
  week: {
    pastOnly: [
      'That week came and went with zero punches.',
      'Past week recap: no shifts, all plot filler.',
      'Last week ghosted every timesheet.'
    ],
    todayOnly: [
      'This week is in stealth mode with no clock-ins.',
      'Week view says: currently all calm, no shifts.',
      'The week is open and suspiciously cooperative.'
    ],
    futureOnly: [
      'Next week is all whitespace and confidence.',
      'No shifts next week. Monday is unemployed.',
      'Seven future days, no obligations detected.'
    ],
    spansToday: [
      'This week straddles now and still nobody clocked in.',
      'Current week status: open schedule, closed timesheet.',
      'The week has energy, just not shift energy.'
    ]
  },
  month: {
    pastOnly: [
      'That month filed a report: zero shifts, all vibes.',
      'Past month is empty like a fridge before payday.',
      'Calendar says that month was a ghost town.'
    ],
    todayOnly: [
      'This month-in-a-day experiment still has no shifts.',
      'Tiny month, big silence, zero clock-ins.',
      'Month mode says no shifts and no urgency.'
    ],
    futureOnly: [
      'Next month is blank enough to hear echoes.',
      'Future month is open and the spreadsheet is nervous.',
      'No shifts next month. Your planner is stretching.'
    ],
    spansToday: [
      'Current month is clear and suspiciously peaceful.',
      'This month is running on vibes, not clock-ins.',
      'Month view says "out of office" by default.'
    ]
  },
  custom: {
    pastOnly: [
      'Custom past range found nothing but calm.',
      'This custom history segment has zero shift sightings.',
      'Past custom range: archived, empty, and unbothered.'
    ],
    todayOnly: [
      'Custom range for today is empty. Efficiency is on break.',
      'Today in custom mode: no shifts, just breathing room.',
      'Custom today range says the clock can relax.'
    ],
    futureOnly: [
      'Custom future range is open and optimistic.',
      'No shifts ahead in this custom window. Very cinematic.',
      'Future custom slice is all potential, no clock-ins.'
    ],
    spansToday: [
      'Custom range crosses today and still no shift sightings.',
      'This custom timeline has range, but no responsibilities.',
      'Wide custom range, tiny stress level, zero shifts.'
    ]
  }
};

const EMPTY_SHIFT_LINES = (range: EmptyShiftRange, tone: EmptyShiftTone): string[] => {
  return EMPTY_SHIFT_RANGE_LINES[range][tone];
};

export default {
  props: {
    selectedRange: {
      type: Object as () => DateRange,
      required: true as const
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
      emptyShiftMessage: '',
    };
  },

  components: { DayScheduleShiftCard, BaseDialog, ClearShiftsForm, ShiftForm, LoadingOverlay },

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
          startTime: new Date(new Date(this.selectedRange.start).setHours(new Date().getHours(), new Date().getMinutes())),
          endTime: new Date(new Date(this.selectedRange.start).setHours(new Date().getHours(), new Date().getMinutes()))
        }
      };
      (this.$refs.shiftDialog as any).showModal();
    },

    updateTimeWidth() {
      this.datetimeWidth = 'auto';

      this.$nextTick(() => {
        const timeWidths = Array.from(document.querySelectorAll('.shift .datetime > *')).map(
          (time) => (time as HTMLElement).clientWidth
        );

        if (timeWidths.length === 0) {
          this.datetimeWidth = 'auto';
          return;
        }

        this.datetimeWidth = Math.max(...timeWidths) + 'px';
      });
    },

    refreshEmptyShiftMessage() {
      const messages = EMPTY_SHIFT_LINES(this.emptyShiftRange, this.emptyShiftTone);

      if (messages.length === 0) {
        this.emptyShiftMessage = 'The schedule is basically on snack break.';
        return;
      }

      if (messages.length === 1) {
        this.emptyShiftMessage = messages[0];
        return;
      }

      let nextMessage = this.emptyShiftMessage;
      while (nextMessage === this.emptyShiftMessage) {
        nextMessage = messages[Math.floor(Math.random() * messages.length)];
      }

      this.emptyShiftMessage = nextMessage;
    }
  },

  computed: {
    ...mapStores(useShiftsStore, useShiftSessionStore),
    selectedShifts(): Shift[] {
      return this.shiftsStore.range(this.selectedRange.start, this.selectedRange.end).sort((a, b) => {
        // Sort by startTime, then by endTime
        return a.startTime.getTime() - b.startTime.getTime() || a.endTime.getTime() - b.endTime.getTime();
      });
    },

    emptyShiftTone(): EmptyShiftTone {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);

      const rangeStart = this.selectedRange.start.getTime();
      const rangeEnd = this.selectedRange.end.getTime();
      const todayStartTime = todayStart.getTime();
      const tomorrowStartTime = tomorrowStart.getTime();

      if (rangeEnd <= todayStartTime) {
        return 'pastOnly';
      }

      if (rangeStart >= tomorrowStartTime) {
        return 'futureOnly';
      }

      if (rangeStart >= todayStartTime && rangeEnd <= tomorrowStartTime) {
        return 'todayOnly';
      }

      return 'spansToday';
    },

    emptyShiftRange(): EmptyShiftRange {
      const start = new Date(this.selectedRange.start);
      const end = new Date(this.selectedRange.end);

      const startDay = new Date(start);
      startDay.setHours(0, 0, 0, 0);

      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);

      const daySpan = Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
      const nextMonthStart = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0);
      const isMonthRange = start.getDate() === 1 && end.getTime() === nextMonthStart.getTime();

      if (isMonthRange) {
        return 'month';
      }

      if (daySpan === 7) {
        return 'week';
      }

      if (daySpan === 1) {
        return 'day';
      }

      return 'custom';
    }
  },

  watch: {
    selectedRange: {
      deep: true,
      handler() {
        if (this.selectedShifts.length === 0) {
          this.refreshEmptyShiftMessage();
        }
      }
    },

    selectedShifts(newShifts: Shift[], oldShifts: Shift[]) {
      if (newShifts.length === 0 && oldShifts.length !== 0) {
        this.refreshEmptyShiftMessage();
      }
    }
  },

  mounted() {
    this.updateTimeWidth();

    if (this.selectedShifts.length === 0) {
      this.refreshEmptyShiftMessage();
    }
  },

  updated() {
    this.updateTimeWidth();
  },
};
</script>

<template>
  <div class="day-schedule" id="day-schedule">
    <div class="actions">
      <button @click="($refs.clearShiftsDialog as any).showModal()" class="danger" id="clear-btn">Clear</button>

      <Transition>
        <button v-if="
          selectedRange.start.getTime() === new Date().setHours(0, 0, 0, 0) && // Only show the check in/out button if the selected date is today
          selectedRange.end.getTime() === new Date(new Date().setDate(new Date().getDate() + 1)).setHours(0, 0, 0, 0) &&
          shiftSessionStore.status !== STATUS.Loading // Don't show the button while loading the shift session
        " @click="handleCheckInOut" id="check-in-out-btn"
          :class="{ primary: !shiftSessionStore.isInProgress, warning: shiftSessionStore.isInProgress }">
          {{ shiftSessionStore.isInProgress ? 'End' : 'Start' }} Shift
        </button>
      </Transition>

      <button @click="handleAddShift" class="success" id="add-btn">Add Shift</button>
    </div>

    <div class="shift-list" id="shift-list">
      <p v-if="selectedShifts.length === 0" class="empty-shifts">
        <span class="title">No shifts in this range.</span>
        <span class="detail">{{ emptyShiftMessage || 'The schedule is basically on snack break.' }}</span>
      </p>

      <DayScheduleShiftCard v-for="shift in selectedShifts" :key="shift.id" :shift="(shift as Shift)"
        :selected-date="selectedRange.start" @edit-shift="handleEditShift" />
    </div>



    <BaseDialog ref="clearShiftsDialog" title="Clear Shifts" open-dialog-text="Clear" :reset-forms="true">
      <ClearShiftsForm :selected-date="selectedRange.start" />
    </BaseDialog>

    <BaseDialog ref="shiftDialog" :title="shiftFormData.title" :reset-forms="shiftFormData.resetForm">
      <ShiftForm :selected-date="selectedRange.start" :shift="shiftFormData.placeholderShift"
        :action="shiftFormData.action" />
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

.actions #clear-btn {
  flex-grow: 0;
}

.actions #check-in-out-btn {
  overflow: hidden;
  flex-grow: 10;
}

/* For animation from Vue */
.actions #check-in-out-btn.v-enter-from,
.actions #check-in-out-btn.v-leave-to {
  flex-grow: 0;
  width: 0;
}

.shift-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin: calc(var(--padding) * 1.5) 0;
  gap: calc(var(--padding) * 1.5);
}

.shift-list:has(.info[open]) .shift:not(:has(.info[open]), :hover) {
  opacity: 0.5;
}

.shift-list {
  --datetime-width: v-bind('datetimeWidth');
}

.empty-shifts {
  margin: 0;
  padding: var(--padding);
  border-radius: var(--border-radius);
  border: 2px dashed var(--text-color-faded);
  background-color: var(--input-background-color);
  color: var(--text-color-faded);
  text-align: center;
}

.empty-shifts .title,
.empty-shifts .detail {
  display: block;
}

.empty-shifts .title {
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: var(--padding-small);
}

.icon-legend {
  align-self: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: var(--padding);
  justify-content: flex-start;
  color: var(--text-color-faded);
  font-size: smaller;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.1em;
}
</style>
