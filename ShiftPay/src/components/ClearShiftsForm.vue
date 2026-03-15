<script lang="ts">
import { mapStores } from 'pinia';

import ButtonConfirm from './ButtonConfirm.vue';

import { useShiftsStore } from '@/stores/shiftsStore';
import { currencyFormat, toTimeStr } from '@/utils';
import type Shift from '@/models/Shift';

export default {
  props: {
    selectedDate: {
      type: Date,
      required: true
    }
  },

  data() {
    return {
      formData: {
        clearOption: '' as '' | 'day' | 'week' | 'all'
      },
      visibleShiftCount: 5
    };
  },

  watch: {
    'formData.clearOption'() {
      this.visibleShiftCount = 5;
    }
  },

  computed: {
    ...mapStores(useShiftsStore),

    dayStart(): Date {
      const d = new Date(this.selectedDate);
      d.setHours(0, 0, 0, 0);
      return d;
    },

    dayEnd(): Date {
      const d = new Date(this.selectedDate);
      d.setHours(23, 59, 59, 999);
      return d;
    },

    weekStart(): Date {
      const d = new Date(this.dayStart);
      d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
      return d;
    },

    weekEnd(): Date {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + 6);
      d.setHours(23, 59, 59, 999);
      return d;
    },

    dayShiftCount(): number {
      return this.shiftsStore.range(this.dayStart, this.dayEnd).length;
    },

    weekShiftCount(): number {
      return this.shiftsStore.range(this.weekStart, this.weekEnd).length;
    },

    totalShiftCount(): number {
      return this.shiftsStore.shifts.length;
    },

    selectedCount(): number | null {
      switch (this.formData.clearOption) {
        case 'day': return this.dayShiftCount;
        case 'week': return this.weekShiftCount;
        case 'all': return this.totalShiftCount;
        default: return null;
      }
    },

    selectedRangeLabel(): string | null {
      const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      switch (this.formData.clearOption) {
        case 'day': return fmt(this.dayStart);
        case 'week': return `${fmt(this.weekStart)} – ${fmt(this.weekEnd)}`;
        case 'all': return 'All time';
        default: return null;
      }
    },

    selectedShifts(): Shift[] {
      switch (this.formData.clearOption) {
        case 'day': return this.shiftsStore.range(this.dayStart, this.dayEnd);
        case 'week': return this.shiftsStore.range(this.weekStart, this.weekEnd);
        case 'all': return this.shiftsStore.shifts as Shift[];
        default: return [];
      }
    },

    sortedSelectedShifts(): Shift[] {
      return [...this.selectedShifts].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      );
    }
  },

  emits: {
    clearShifts(payload: string) {
      const options = ['day', 'week', 'all'];
      return options.includes(payload);
    }
  },

  methods: {
    currencyFormat,
    toTimeStr,

    showMore() {
      this.visibleShiftCount += 10;
    },

    formatDate(d: Date): string {
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    },

    formatShiftDate(d: Date): string {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },

    clearShifts(event: Event) {
      const form = event.currentTarget as HTMLFormElement;

      const startTime = new Date(this.selectedDate);
      const endTime = new Date(this.selectedDate);

      startTime.setHours(0, 0, 0, 0);
      endTime.setHours(23, 59, 59, 999);

      const option = (form.querySelector('input[name="clearOption"]:checked') as HTMLInputElement)?.value;

      switch (option) {
        case 'week':
          startTime.setDate(startTime.getDate() - (startTime.getDay() == 0 ? 7 : startTime.getDay() - 1));
          endTime.setDate(endTime.getDate() - (endTime.getDay() == 0 ? 7 : endTime.getDay() - 1) + 7);
        // eslint-disable-next-line no-fallthrough
        case 'day':
          this.shiftsStore.delete(this.shiftsStore.range(startTime, endTime).map((shift) => shift.id));
          break;

        case 'all':
          this.shiftsStore.delete();
          break;

        default:
          alert('Something went wrong. Please try again.');
          throw new Error('Invalid option');
      }

      form.reset();

      const dialog = form.closest('dialog') as HTMLDialogElement;
      dialog?.close();
    }
  },

  components: {
    ButtonConfirm
  }
};
</script>

<template>
  <form @submit.prevent="clearShifts" class="clear-form">
    <p class="description">Select which shifts you want to clear.</p>

    <div class="options">
      <label class="option-card" :class="{ selected: formData.clearOption === 'day' }">
        <input type="radio" v-model="formData.clearOption" name="clearOption" value="day" required />
        <div class="option-content">
          <span class="option-label">Day</span>
          <span class="option-detail">{{ formatDate(dayStart) }}</span>
          <span class="option-count">{{ dayShiftCount }} shift{{ dayShiftCount !== 1 ? 's' : '' }}</span>
        </div>
      </label>

      <label class="option-card" :class="{ selected: formData.clearOption === 'week' }">
        <input type="radio" v-model="formData.clearOption" name="clearOption" value="week" required />
        <div class="option-content">
          <span class="option-label">Week</span>
          <span class="option-detail">{{ formatDate(weekStart) }} – {{ formatDate(weekEnd) }}</span>
          <span class="option-count">{{ weekShiftCount }} shift{{ weekShiftCount !== 1 ? 's' : '' }}</span>
        </div>
      </label>

      <label class="option-card" :class="{ selected: formData.clearOption === 'all' }">
        <input type="radio" v-model="formData.clearOption" name="clearOption" value="all" required />
        <div class="option-content">
          <span class="option-label">All</span>
          <span class="option-detail">All time</span>
          <span class="option-count">{{ totalShiftCount }} shift{{ totalShiftCount !== 1 ? 's' : '' }}</span>
        </div>
      </label>
    </div>

    <Transition name="fade">
      <div v-if="selectedCount !== null" class="summary">
        <div class="summary-header">
          <span class="summary-range">{{ selectedRangeLabel }}</span>
          <span class="summary-count">
            <strong>{{ selectedCount }}</strong> shift{{ selectedCount !== 1 ? 's' : '' }} will be cleared
          </span>
        </div>

        <ul v-if="sortedSelectedShifts.length > 0" class="shift-list">
          <li v-for="shift in sortedSelectedShifts.slice(0, visibleShiftCount)" :key="shift.id" class="shift-item">
            <span class="shift-workplace">{{ shift.workplace }}</span>
            <span class="shift-time">
              {{ formatShiftDate(shift.startTime) }}, {{ toTimeStr(shift.startTime) }} – {{ toTimeStr(shift.endTime) }}
            </span>
            <span class="shift-income">{{ currencyFormat(shift.income) }}</span>
          </li>
          <li v-if="sortedSelectedShifts.length > visibleShiftCount" class="shift-item more">
            <button type="button" class="load-more-btn" @click="showMore">
              Show more ({{ sortedSelectedShifts.length - visibleShiftCount }} remaining)
            </button>
          </li>
        </ul>
      </div>
    </Transition>

    <div class="actions">
      <ButtonConfirm type="submit" class="danger">Clear</ButtonConfirm>
    </div>
  </form>
</template>

<style scoped>
.clear-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.description {
  margin: 0;
  color: var(--text-color);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: var(--border-radius);
  background-color: light-dark(rgba(255, 255, 255, 0.55), rgba(24, 24, 24, 0.75)) !important;
  cursor: pointer;
  transition: outline 0.25s;
  outline: 2px solid var(--input-background-color);
}

.option-card:hover {
  outline-color: var(--text-color-faded);
}

.option-card.selected {
  outline-color: var(--primary-color);
}

.option-card input[type='radio'] {
  margin: 0;
  flex-shrink: 0;
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.option-label {
  font-weight: bold;
  font-size: 1rem;
}

.option-detail {
  font-size: 0.85rem;
  color: var(--text-color-faded);
}

.option-count {
  font-size: 0.8rem;
  color: var(--text-color-faded);
}

.summary {
  background-color: var(--input-background-color);
  border-radius: var(--border-radius);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.summary-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: center;
}

.summary-range {
  font-size: 0.85rem;
  color: var(--text-color-faded);
}

.summary-count {
  font-size: 0.95rem;
  color: var(--danger-color);
}

.shift-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 10rem;
  overflow-y: auto;
}

.shift-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: var(--border-radius);
  background-color: light-dark(rgba(255, 255, 255, 0.55), rgba(24, 24, 24, 0.75)) !important;
  font-size: 0.85rem;
}

.shift-item.more {
  justify-content: center;
  background: none;
  padding: 0;
}

.load-more-btn {
  background: none;
  box-shadow: none;
  color: var(--primary-color);
  font-size: 0.85rem;
  font-weight: normal;
  padding: 0.3rem 0.5rem;
  line-height: 1.4em;
}

.load-more-btn:hover {
  text-decoration: underline;
  box-shadow: none;
  opacity: 1;
}

.shift-workplace {
  font-weight: bold;
}

.shift-time {
  flex: 1;
  color: var(--text-color-faded);
  white-space: nowrap;
}

.shift-income {
  margin-left: auto;
  white-space: nowrap;
  font-weight: bold;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
