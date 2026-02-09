<script lang="ts">
import { type Day, STATUS } from '@/types';
import { currencyFormat } from '@/utils';

import { mapStores } from 'pinia';

import { useShiftsStore, STAT_OPTIONS, type Stats } from '@/stores/shiftsStore';
import LoadingOverlay from '@/components/LoadingOverlay.vue';

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
      STATUS,
      title: 'Week Schedule',
      weekDays: ['M.', 'Tu.', 'W.', 'Th.', 'F', 'Sa.', 'Su.'],
      today,
      monthChange: 0,
      spaceBetweenDay: '0px',
      // type as the union of all subcategory keys across STAT_OPTIONS
      selectedSubCategoryOption: 'beforeTax' as { [K in keyof typeof STAT_OPTIONS]: keyof (typeof STAT_OPTIONS)[K] }[keyof typeof STAT_OPTIONS],
      STAT_OPTIONS
    };
  },

  components: { LoadingOverlay },

  computed: {
    ...mapStores(useShiftsStore),

    selectedStatCategory(): keyof typeof STAT_OPTIONS {
      const selected = this.selectedSubCategoryOption;
      const categories = Object.keys(this.STAT_OPTIONS) as Array<keyof typeof STAT_OPTIONS>;

      for (const category of categories) {
        if (selected in this.STAT_OPTIONS[category]) {
          return category;
        }
      }

      // Fallback (shouldn't happen unless STAT_OPTIONS changes)
      return categories[0] ?? 'income';
    },

    calendar() {
      const changedDate = new Date(this.today);
      changedDate.setDate(1);
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

    weekStats() {
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

    monthStats(): Stats {
      const date = new Date(this.today);
      date.setDate(1);
      date.setMonth(date.getMonth() + this.monthChange);

      const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
      const lastDayOfMonth = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth() + 1, 0, 0, 0, 0, 0);

      const monthEnd = new Date(lastDayOfMonth);
      monthEnd.setDate(monthEnd.getDate() + 1); // Exclusive end: first day of next month at 12am

      return this.shiftsStore.stats(firstDayOfMonth, monthEnd);
    },

    monthLastDay(): string {
      const date = new Date(this.today);
      date.setDate(1);
      date.setMonth(date.getMonth() + this.monthChange);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const suffix = lastDay === 31 ? 'st' : 'th';
      return `${lastDay}${suffix}`;
    },
  },

  methods: {
    updateTitleByMonth() {
      const date = new Date(this.today);
      date.setDate(1);
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

    getLabel(subcat: { label: string; }) {
      return subcat.label;
    },

    formatStat(stats: Stats) {
      const category = this.selectedStatCategory;
      const sub = this.selectedSubCategoryOption;

      switch (category) {
        case 'income': {
          if (sub in stats.income) {
            return currencyFormat(stats.income[sub as keyof Stats['income']]);
          }

          return currencyFormat(stats.income.beforeTax);
        }

        case 'hours': {
          if (sub in stats.hours) {
            const duration = stats.hours[sub as keyof Stats['hours']];
            return duration.format();
          }
          return '';
        }

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

    <select v-model="selectedSubCategoryOption" class="category">
      <optgroup v-for="(subCategory, category) in STAT_OPTIONS" :key="category" :label="category">
        <option v-for="(subcat, subcatKey) in subCategory" :key="subcatKey" :value="subcatKey">
          {{ getLabel(subcat) }}
        </option>
      </optgroup>
    </select>

    <div class="weekly stats" title="Weekly Stats">
      <span class="stat" v-for="(week, i) in weekStats" :key="i">
        {{ formatStat(week.stats) }}
      </span>
    </div>

    <div class="legend">
      <div class="legend-item">
        <span class="legend-icon today-icon"></span>
        <span>Today</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon has-shift-icon"></span>
        <span>Has shift</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon selected-icon"></span>
        <span>Selected</span>
      </div>
    </div>

    <div class="monthly stats" title="Monthly Stats">
      <span class="month-range-label">1st - {{ monthLastDay }}</span>
      <span class="stat">{{ formatStat(monthStats) }}</span>
    </div>

    <LoadingOverlay :active="shiftsStore.status === STATUS.Loading" />
  </div>
</template>

<style scoped>
.week-schedule {
  position: relative;
  display: grid;
  grid-template-columns: 7fr minmax(min-content, 1fr);
  grid-template-rows: repeat(2, 2.5rem) 1fr auto;
  column-gap: var(--padding-small);
  row-gap: 2px;
  grid-template-areas:
    'month-nav month-nav'
    'weekdays category'
    'calendar weekly'
    'legend monthly';
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

/* TODO: use new custom select options */
.category,
.subcategory {
  width: 100%;
  background-color: var(--primary-color);
  color: var(--text-color-black);
  outline: none;
  border: none;
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
}

.weekly {
  grid-area: weekly;
}

.monthly {
  grid-area: monthly;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  background-color: var(--primary-color);
  color: var(--text-color-black);
  padding: var(--padding-small);
  border-bottom-left-radius: var(--border-radius);
  border-bottom-right-radius: var(--border-radius);
  min-width: 8ch;
}

.month-range-label {
  font-size: 0.75em;
  opacity: 0.6;
}

.stat {
  display: flex;
  flex-direction: row;
  align-items: center;
  white-space: nowrap;
}

.legend {
  grid-area: legend;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: var(--padding-small) 0;
  font-size: smaller;
  color: var(--text-color-faded);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.legend-icon {
  display: inline-grid;
  place-content: center;
  height: 1.6em;
  width: 1.6em;
  border-radius: 50%;
  font-size: 0.75em;
  line-height: 1;
}

.today-icon {
  background-color: var(--primary-color);
}

.has-shift-icon {
  background-color: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
}

.selected-icon {
  border-radius: 0;
  border: 1.5px solid light-dark(black, lightgrey);
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
