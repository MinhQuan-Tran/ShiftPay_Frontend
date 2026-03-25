<script lang="ts">
import Shift from '@/models/Shift';

import ButtonConfirm from '@/components/ButtonConfirm.vue';

import { currencyFormat, toTimeStr } from '@/utils';

export default {
  props: {
    shift: {
      type: Object as () => Shift,
      required: true
    },
    selectedDate: {
      type: Date,
      required: true
    }
  },

  emits: ['edit-shift'],

  components: {
    ButtonConfirm
  },

  methods: {
    currencyFormat,
    toTimeStr,

    handleEditShift(shift: Shift) {
      this.$emit('edit-shift', shift);
    }
  }
};
</script>

<template>
  <div class="shift">
    <div class="datetime">
      <div class="start-time" title="Start Time">
        <div class="date"
          v-if="new Date(shift.startTime).setHours(0, 0, 0, 0) !== new Date(selectedDate).setHours(0, 0, 0, 0)">
          {{
            shift.startTime.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            })
          }}
        </div>
        <div class="time">{{ toTimeStr(shift.startTime) }}</div>
      </div>
      <div class="end-time" title="End Time">
        <div class="date"
          v-if="new Date(shift.endTime).setHours(0, 0, 0, 0) !== new Date(selectedDate).setHours(0, 0, 0, 0)">
          {{
            shift.endTime.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            })
          }}
        </div>
        <div class="time">{{ toTimeStr(shift.endTime) }}</div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Allow user to open multiple shifts to compare -->
    <details class="info">
      <summary>
        <div class="workplace" title="Workplace">{{ shift.workplace }}</div>

        <div class="main">
          <div class="billable-duration" title="Billable Duration">
            {{ shift.billableDuration?.format() ?? 'error' }}
          </div>

          <div class="pay-rate" title="Pay Rate">× {{ currencyFormat(shift.payRate) }}/h =</div>

          <div class="income" title="Income">
            {{ shift.income === undefined ? 'error' : currencyFormat(shift.income) }}
          </div>
        </div>
      </summary>

      <div class="others">
        <div v-if="shift.totalBreakDuration.totalMinutes" class="unpaid-breaks" title="Total Unpaid Break Duration">
          + {{ shift.totalBreakDuration.format(undefined, 'always') }} 💤
        </div>

        <div v-if="shift.totalBreakDuration.totalMinutes" class="shift-duration"
          title="Shift Duration (including breaks)">
          = {{ shift.duration.format(undefined, 'always') }}
        </div>

        <div class="actions">
          <button @click="handleEditShift(shift)">Edit</button>
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.shift {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: start;
  text-wrap: balance;
  text-wrap: pretty;
  word-break: break-word;
  overflow-wrap: break-word;
  --divider-width: 4px;
  /* --divider-border-radius: calc(var(--divider-width) / 2); */
  border-radius: var(--border-radius);
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.5);
  transition: all 0.3s;
  overflow: visible;
}

.shift:hover,
.shift:has(.info[open]) {
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.8);
}

.divider {
  align-self: stretch;
  min-width: var(--divider-width);
  width: var(--divider-width);
  /* border-radius: var(--divider-border-radius); */
  background: var(--primary-color);
}

.datetime {
  /* using props and v-bind cause DaySchedule to update */
  min-width: var(--datetime-width);
  width: var(--datetime-width);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  text-align: right;
  gap: 1em;
  padding: var(--padding-small) var(--padding);
  border-radius: var(--border-radius) 0 0 var(--border-radius);
  white-space: nowrap;
  background: light-dark(white, #414141) !important;
}

.datetime .date {
  font-size: smaller;
  font-weight: bold;
  opacity: 0.5;
}

.info {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  background: light-dark(#dddddd, #343434);
  border-radius: 0 var(--border-radius) var(--border-radius) 0;
  padding: 0;
  transition: all 0.3s;
}

.info summary::marker,
.info summary::-webkit-details-marker {
  display: none !important;
}

.info summary {
  display: flex;
  flex-direction: column;
  gap: var(--padding);
  background-color: light-dark(white, var(--input-background-color));
  padding: var(--padding);
  border-radius: 0 var(--border-radius) var(--border-radius) 0;
  position: relative;
  cursor: pointer;
}

.info .main {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--padding-small);
}

.info .workplace {
  font-weight: bold;
  color: var(--text-color);
}

.info .billable-duration {
  color: light-dark(#0088ff, #64b6ff);
  background: rgba(0, 111, 222, 0.2);
  padding: var(--padding-small) var(--padding);
  border-radius: 999px;
}

.info .income {
  color: light-dark(#00c600, #64ff64);
  background: rgba(0, 222, 0, 0.2);
  padding: var(--padding-small) var(--padding);
  border-radius: 999px;
  transition: all var(--transition-duration);
}

.info .pay-rate {
  display: none;
}

.info:open .pay-rate {
  display: initial;
}

.info summary,
.info .unpaid-breaks,
.info .shift-duration {
  color: var(--text-color-faded);
  white-space: nowrap;
}

.info .others {
  display: flex;
  flex-direction: column;
  gap: var(--padding-small);
  margin: var(--padding);
}
</style>
