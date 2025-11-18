<script lang="ts">
import Duration from '@/models/Duration';
import type { Week, Day } from '@/types';
import { currencyFormat } from '@/utils';

import { mapStores } from 'pinia';

import { useShiftsStore } from '@/stores/shiftStore';

export default {
  props: {
    selectedDate: {
      type: Date,
      required: true
    }
  },

  emits: ['update:selectedDate'],

  data() {
    const today = new Date();

    return {
      title: 'Week Schedule',
      weekDays: ['M.', 'Tu.', 'W.', 'Th.', 'F', 'Sa.', 'Su.'],
      today,
      monthChange: 0,
      spaceBetweenDay: '0px',
      selectedWeekSummaryOption: 'income'
    };
  },

  computed: {
    ...mapStores(useShiftsStore),

    calendar() {
      const changedDate = new Date(this.today);
      changedDate.setMonth(changedDate.getMonth() + this.monthChange);

      const firstDayOfMonth = new Date(changedDate.getFullYear(), changedDate.getMonth(), 1, 0, 0, 0, 0);
      const lastDayOfMonth = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth() + 1, 0, 0, 0, 0, 0);
      const firstDayOfWeek = firstDayOfMonth.getDay();

      let currentDate = new Date(firstDayOfMonth);

      // Set the currentDate to the first day of the week (Monday)
      // e.g. if the first day of the month is on Friday 1 December 2023,
      // then the first day of the week is 1 December 2023 - 5 days = Sunday 26 November 2023
      // Sunday 26 November 2023 + 1 day = Monday 27 November 2023
      currentDate.setDate(currentDate.getDate() - firstDayOfWeek + 1);
      currentDate.setHours(0, 0, 0, 0);

      const calendar = [];
      while (currentDate <= lastDayOfMonth) {
        const week = {
          days: [] as Day[],
          summaries: {
            income: 0,
            totalHours: {
              hours: 0,
              minutes: 0
            } as Duration
          }
        } as Week;

        // from 12am on Monday
        const startTime = new Date(currentDate);
        startTime.setHours(0, 0, 0, 0);

        // to 12am on the next Monday
        const endTime = new Date(currentDate);
        endTime.setDate(endTime.getDate() + 7);
        endTime.setHours(0, 0, 0, 0);

        const shifts = this.shiftsStore.range(startTime, endTime);

        week.summaries.income += shifts.reduce((acc, shift) => (acc += shift.income ?? 0), 0);

        week.summaries.totalHours = shifts.reduce(
          (acc, shift) => {
            acc.hours += shift.duration.hours;
            acc.minutes += shift.duration.minutes;
            return acc;
          },
          new Duration({ hours: 0, minutes: 0 })
        );

        week.summaries.totalBillableHours = shifts.reduce(
          (acc, shift) => {
            acc.hours += shift.billableDuration.hours;
            acc.minutes += shift.billableDuration.minutes;
            return acc;
          },
          new Duration({ hours: 0, minutes: 0 })
        );

        // Create the days of the week
        for (let i = 0; i < 7; i++) {
          const isPrevMonth = currentDate.getMonth() < firstDayOfMonth.getMonth();
          const isNextMonth = currentDate.getMonth() > firstDayOfMonth.getMonth();

          const dayStartTime = new Date(currentDate); // 12am on the current day
          const dayEndTime = new Date(currentDate); // 12am on the next day
          dayEndTime.setDate(dayEndTime.getDate() + 1);

          week.days.push({
            dayStartTime: dayStartTime,
            dayEndTime: dayEndTime,
            prevMonth: isPrevMonth,
            nextMonth: isNextMonth
          } as Day);

          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Round the total to 2 decimal places
        week.summaries.income = Math.round(week.summaries.income * 100) / 100;

        calendar.push(week);
      }

      return calendar;
    }
  },

  methods: {
    currencyFormat,

    updateTitleByMonth() {
      const date = new Date(this.today);
      date.setMonth(date.getMonth() + this.monthChange);
      this.title = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    },

    goToNextMonth() {
      this.monthChange++;
      this.updateTitleByMonth();
    },

    goToPrevMonth() {
      this.monthChange--;
      this.updateTitleByMonth();
    },

    weekSummary(week: Week) {
      switch (this.selectedWeekSummaryOption) {
        case 'income':
          return currencyFormat(week.summaries.income);
        case 'totalHours':
          return week.summaries.totalHours.format();
        case 'totalBillableHours':
          return week.summaries.totalBillableHours.format();
        default:
          return '';
      }
    }
  },

  mounted() {
    this.updateTitleByMonth();
  },

  updated() {
    const firstChild = document.querySelector('.calendar > *:first-child');
    const secondChild = document.querySelector('.calendar > *:nth-child(2)');

    if (firstChild && secondChild) {
      const firstChildRect = firstChild.getBoundingClientRect();
      const secondChildRect = secondChild.getBoundingClientRect();

      this.spaceBetweenDay = secondChildRect.left - firstChildRect.left + 'px';
    }
  }
};
</script>

<template>
  <div class="week-schedule">
    <div class="title">
      <button class="prev-btn" @click="goToPrevMonth">
        <img src="@/components/icons/next.svg" alt="prev" />
      </button>
      <b>{{ title }}</b>
      <button class="next-btn" @click="goToNextMonth">
        <img src="@/components/icons/next.svg" alt="next" />
      </button>
    </div>

    <div class="calendar-summaries">
      <div class="calendar">
        <div class="week-day" v-for="day in weekDays" :key="day">{{ day }}</div>

        <template v-for="(week, weekIndex) in calendar" :key="weekIndex">
          <div v-for="(day, dayIndex) in week.days" :key="dayIndex"
            @click="$emit('update:selectedDate', day.dayStartTime)" :class="[
              'day-container',
              {
                // Compare the dates only
                selected: selectedDate && selectedDate.getTime() === day.dayStartTime.getTime(),
                'has-shift':
                  shiftsStore.range(day.dayStartTime, day.dayEndTime).length > 0,
                'has-shift-past':
                  shiftsStore.range(day.dayStartTime, day.dayEndTime)
                    .some((shift) => new Date(shift.startTime) < day.dayStartTime),
                'has-shift-future':
                  shiftsStore.range(day.dayStartTime, day.dayEndTime)
                    .some((shift) => day.dayEndTime < new Date(shift.endTime))
              }
            ]">
            <div :class="[
              'day',
              {
                today: day.dayStartTime.getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
                'prev-month': day.prevMonth,
                'next-month': day.nextMonth
              }
            ]">
              {{ day.dayStartTime.getDate() }}
            </div>
          </div>
        </template>
      </div>

      <div class="summaries">
        <select v-model="selectedWeekSummaryOption" class="week-summary-options">
          <option value="income" selected>Income</option>
          <option value="totalHours">Hours</option>
          <option value="totalBillableHours">Billable</option>
        </select>

        <div class="summary" v-for="(week, weekIndex) in calendar" :key="weekIndex">
          <span>{{ weekSummary(week) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-schedule {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
}

.title {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  font-size: larger;
  margin: 0.5rem 0 1rem 0;
}

.prev-btn,
.next-btn {
  background: none;
  border: none;
  outline: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  width: 32px;
  transition: all 0.3s ease-in-out;
  user-select: none;
  border-radius: var(--border-radius);
}

.prev-btn,
.next-btn,
.prev-btn:hover,
.next-btn:hover {
  box-shadow: none;
}

.prev-btn:hover::before,
.next-btn:hover::before {
  content: '';
  position: absolute;
  height: 32px;
  width: 32px;
  background-color: var(--primary-color);
  border-radius: var(--border-radius);
  opacity: 0.8;
}

.prev-btn img,
.next-btn img {
  z-index: 1;
}

.prev-btn {
  transform: rotate(180deg);
}

.calendar-summaries {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
  gap: var(--padding-small);
}

.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 2.5rem;
  text-align: center;
  width: 100%;
}

.calendar>* {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  user-select: none;
}

.day-container {
  cursor: pointer;
  border: 0 solid gray;
}

.day-container:hover,
.day-container:focus {
  border: 1px solid gray;
}

.selected {
  border: 1.5px solid light-dark(black, lightgrey) !important;
}

.week-day,
.week-total {
  font-weight: bold;
  font-size: smaller;
}

.week-day {
  color: var(--text-color-faded);
}

.summaries {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* Cannot use fit-content in clamp() or min() */
  min-width: fit-content;
  width: 10ch;
}

@media screen and (min-width: 600px) {
  .summaries {
    width: 15ch;
  }
}

.summaries>* {
  height: 2.5rem;
}

.week-summary-options {
  background-color: var(--primary-color);
  color: var(--text-color-black);
  outline: none;
  border-top-left-radius: var(--border-radius);
  border-top-right-radius: var(--border-radius);
  border: none;
  border-bottom: 2px solid var(--background-color);
}

.summary {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  background-color: var(--primary-color);
  padding: 0 var(--padding-small);
  color: var(--text-color-black);
  text-wrap: nowrap;
}

.summary:last-child {
  border-radius: 0 0 var(--border-radius) var(--border-radius);
}

.day {
  position: relative;
  height: 2em;
  width: 2em;
  margin: auto;
  border-radius: 50%;
  display: grid;
  place-content: center;
  border: none;
  background: none;
  line-height: 1em;
}

.prev-month,
.next-month {
  color: var(--text-color-faded);
}

.today {
  background-color: var(--primary-color) !important;
  color: var(--text-color-black);
  font-weight: bold;
}

.has-shift::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  --size: 1.85em;
  --add-left-space: 0px;
  --add-right-space: 0px;
  width: calc(var(--add-left-space) + var(--add-right-space) + var(--size));
  height: var(--size);
  transform: translate(calc(-1 * (var(--size) / 2)), -50%);
  border-radius: 2em;
  background-color: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
}

.has-shift-past::before {
  left: -50%;
  --add-left-space: v-bind('spaceBetweenDay');
}

.has-shift-future::before {
  --add-right-space: v-bind('spaceBetweenDay');
}
</style>
