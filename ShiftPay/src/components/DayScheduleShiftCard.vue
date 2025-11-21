<script lang="ts">
import Shift from '@/models/Shift';

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

        <div class="billable-duration" title="Billable Duration">
          {{ shift.billableDuration?.format('short') ?? 'error' }}
          <img width="48" height="48" src="https://img.icons8.com/fluency/48/time-card.png" alt="time-card"
            class="inline-icon" />
        </div>

        <div class="income" title="Income">
          <img width="48" height="48" src="https://img.icons8.com/fluency/48/cash--v1.png" alt="cash--v1"
            class="inline-icon" />
          {{ shift.income === undefined ? 'error' : currencyFormat(shift.income) }}
        </div>

        <div class="unpaid-breaks" title="Total Unpaid Break Duration">
          {{ shift.totalBreakDuration.format('short') }}
          <img width="48" height="48" src="https://img.icons8.com/fluency/48/tea.png" alt="tea" class="inline-icon" />
        </div>
      </summary>

      <div class="details">
        <div class="info">
          <div class="others">
            <div class="hourly-rate" title="Hourly Rate">{{ currencyFormat(shift.payRate) }}/hr</div>
          </div>

          <div class="times">
            <div v-for="(breakTime, index) in shift.unpaidBreaks" :key="index">
              <div>
                {{ breakTime.format('short') }}
                <img width="48" height="48" src="https://img.icons8.com/fluency/48/tea.png" alt="tea"
                  class="inline-icon" />
              </div>
            </div>

            <div class="shift-duration" title="Shift Duration (including breaks)">
              {{ shift.duration.format('short') }}
              <img width="48" height="48" src="https://img.icons8.com/fluency/48/clock.png" alt="clock"
                class="inline-icon" />
            </div>
          </div>
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
}

.shift:hover,
.shift:has(.info[open]) {
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.8);
}

.divider {
  align-self: stretch;
  width: var(--divider-width);
  /* border-radius: var(--divider-border-radius); */
  background: var(--primary-color);
}

.datetime {
  /* using props and v-bind cause DaySchedule to update */
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
  background-color: var(--input-background-color);
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
  background: light-dark(#d8d8d8, #343434);
  border-radius: 0 var(--border-radius) var(--border-radius) 0;
  padding: 0;
  transition: all 0.3s;
}

.info summary::marker,
.info summary::-webkit-details-marker {
  display: none !important;
}

.info summary {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'workplace billable-duration'
    'income   unpaid-breaks';
  gap: var(--padding);
  justify-items: stretch;
  justify-content: stretch;
  align-items: center;
  align-content: space-between;
  background-color: var(--input-background-color);
  padding: var(--padding);
  border-radius: 0 var(--border-radius) var(--border-radius) 0;
  position: relative;
  cursor: pointer;
}

.info summary>* {
  text-wrap: balance;
  text-wrap: pretty;
  word-break: break-word;
  overflow-wrap: break-word;
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  gap: var(--padding-small);
}

.info summary>*:nth-child(2n) {
  text-align: right;
  justify-content: flex-end;
}

.info summary .workplace {
  grid-area: workplace;
  font-weight: bold;
}

.info summary .income {
  grid-area: income;
}

.info summary .billable-duration {
  grid-area: billable-duration;
}

.info summary .unpaid-breaks {
  grid-area: unpaid-breaks;
}

.details {
  padding: var(--padding);
  border-radius: 0 0 var(--border-radius) 0;
  display: flex;
  flex-direction: column;
  gap: var(--padding-small);
}

.details .info {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.details .info>* {
  text-wrap: balance;
  text-wrap: pretty;
  word-break: break-word;
  overflow-wrap: break-word;
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: stretch;
  gap: var(--padding);
}

.details .info .times {
  text-align: right;
}

.details .actions {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: var(--padding);
}

.details .actions>* {
  flex: 1;
  box-shadow: none;
}
</style>
