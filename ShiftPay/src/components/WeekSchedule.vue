<script lang="ts">
import type { Day } from '@/types';
import { currencyFormat } from '@/utils';

import { mapStores } from 'pinia';

import { useShiftsStore, STAT_OPTIONS, type Stats } from '@/stores/shiftsStore';

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
      selectedStatOption: 'income' as keyof typeof STAT_OPTIONS,
      // type as the union of all subcategory keys across STAT_OPTIONS
      selectedSubcategoryOption: 'beforeTax' as keyof (typeof STAT_OPTIONS)[keyof typeof STAT_OPTIONS],
      STAT_OPTIONS
    };
  },

  computed: {
    ...mapStores(useShiftsStore),

    statSubcategoryOptions() {
      return this.STAT_OPTIONS[this.selectedStatOption];
    },

    calendar() {
      const changedDate = new Date(this.today);
      changedDate.setMonth(changedDate.getMonth() + this.monthChange);

      const firstDayOfMonth = new Date(changedDate.getFullYear(), changedDate.getMonth(), 1, 0, 0, 0, 0);
      const lastDayOfMonth = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth() + 1, 0, 0, 0, 0, 0);
      const dayOfWeek = firstDayOfMonth.getDay();

      const firstDateInCalendar = new Date(firstDayOfMonth);

      // Set the firstDateInCalendar to the first day of the week (Monday)
      // e.g. if the first day of the month is on Friday 1 December 2023,
      // then the first day of the week is 1 December 2023 - 5 days = Sunday 26 November 2023
      // Sunday 26 November 2023 + 1 day = Monday 27 November 2023
      firstDateInCalendar.setDate(firstDateInCalendar.getDate() - dayOfWeek + 1);

      // Set the lastDateInCalendar to the last day of the week (Sunday)
      // e.g. if the last day of the month is on Wednesday 31 January 2024,
      // then the last day of the week is 31 January 2024 + 4 days = Sunday 4 February 2024
      const lastDateInCalendar = new Date(lastDayOfMonth);
      lastDateInCalendar.setDate(lastDateInCalendar.getDate() + (7 - lastDateInCalendar.getDay()) % 7);

      const calendar = [];
      for (
        const currentDate = new Date(firstDateInCalendar);
        currentDate <= lastDateInCalendar;
        currentDate.setDate(currentDate.getDate() + 1)
      ) {
        const isPrevMonth = currentDate.getMonth() < firstDayOfMonth.getMonth();
        const isNextMonth = currentDate.getMonth() > firstDayOfMonth.getMonth();

        const dayStartTime = new Date(currentDate); // 12am on the current day
        const dayEndTime = new Date(currentDate); // 12am on the next day
        dayEndTime.setDate(dayEndTime.getDate() + 1);

        calendar.push({
          dayStartTime: dayStartTime,
          dayEndTime: dayEndTime,
          prevMonth: isPrevMonth,
          nextMonth: isNextMonth
        } as Day);
      }

      return calendar;
    },

    weeks() {
      if (!Array.isArray(this.calendar) || this.calendar.length === 0) return [];
      const weeks: Array<{ start: Date; end: Date; stats: Stats; }> = [];

      for (let weekIndex = 0; weekIndex < this.calendar.length / 7; weekIndex++) {
        const weekStartDay = this.calendar[weekIndex * 7];
        const start = new Date(weekStartDay.dayStartTime);
        start.setHours(0, 0, 0, 0); // Monday 12am
        const end = new Date(start);
        end.setDate(end.getDate() + 7); // Next Monday 12am (exclusive end)

        // Gather stats using store getter
        const stats = this.shiftsStore.stats(start, end);
        weeks.push({ start, end, stats });
      }
      return weeks;
    },
  },

  methods: {
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

    formatStat(stats: any) {
      const category = this.selectedStatOption;
      const sub = this.selectedSubcategoryOption;

      switch (category) {
        case 'income':
          return currencyFormat(stats.income.beforeTax);

        case 'hours': {
          const duration = stats.hours[sub];
          if (duration && typeof duration.format === 'function') {
            return duration.format();
          }
          return String(duration);
        }

        default:
          return '';
      }
    }
  },

  watch: {
    selectedStatOption(newVal: keyof typeof STAT_OPTIONS) {
      this.selectedSubcategoryOption = Object.keys(this.STAT_OPTIONS[newVal])[0] as keyof (typeof STAT_OPTIONS)[keyof typeof STAT_OPTIONS];
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
    <div class="month-nav">
      <button class="prev-btn" @click="goToPrevMonth">
        <img src="@/components/icons/next.svg" alt="prev" />
      </button>
      <b>{{ title }}</b>
      <button class="next-btn" @click="goToNextMonth">
        <img src="@/components/icons/next.svg" alt="next" />
      </button>
    </div>

    <div class="weekdays">
      <div class="week-day" v-for="day in weekDays" :key="day">{{ day }}</div>
    </div>

    <div class="calendar">
      <div v-for="(day, dayIndex) in calendar" :key="dayIndex" @click="$emit('update:selectedDate', day.dayStartTime)"
        :class="[
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
    </div>

    <select v-model="selectedStatOption" class="category">
      <option v-for="(_, category) in STAT_OPTIONS" :key="category" :value="category">{{ category }}</option>
    </select>

    <select v-model="selectedSubcategoryOption" class="subcategory">
      <option v-for="(subcat, index) in statSubcategoryOptions" :key="index" :value="index">
        {{ (subcat as any).label }}
      </option>
    </select>

    <div class="stats">
      <span class="stat" v-for="(week, i) in weeks" :key="i">
        {{ formatStat(week.stats) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.week-schedule {
  display: grid;
  grid-template-columns: 7fr minmax(min-content, 1fr);
  grid-template-rows: repeat(2, 2.5rem) 1fr;
  column-gap: var(--padding-small);
  grid-template-areas:
    'month-nav category'
    'weekdays subcategory'
    'calendar stats';
}

.month-nav {
  grid-area: month-nav;
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

.calendar {
  grid-area: calendar;
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

.weekdays {
  grid-area: weekdays;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: var(--text-color-faded);
}

.week-day {
  display: flex;
  align-items: center;
  justify-content: center;
}

.week-day,
.week-total {
  font-weight: bold;
  font-size: smaller;
}

.category,
.subcategory {
  width: 100%;
  background-color: var(--primary-color);
  color: var(--text-color-black);
  outline: none;
  border: none;
  border-bottom: 2px solid var(--background-color);
  text-transform: capitalize;
}

.category {
  grid-area: category;
  border-top-left-radius: var(--border-radius);
  border-top-right-radius: var(--border-radius);
}

.subcategory {
  grid-area: subcategory;
}

.stats {
  grid-area: stats;
  display: grid;
  grid-auto-rows: auto;
  min-width: 8ch;
  padding: 0 var(--padding-small);
  background-color: var(--primary-color);
  color: var(--text-color-black);
  border-bottom-left-radius: var(--border-radius);
  border-bottom-right-radius: var(--border-radius);
}

.stat {
  display: flex;
  flex-direction: row;
  align-items: center;
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
