<script lang="ts">
import { mapStores } from 'pinia';

import ButtonConfirm from './ButtonConfirm.vue';

import { useShiftsStore } from '@/stores/shiftsStore';

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
        clearOption: ''
      }
    };
  },

  computed: {
    ...mapStores(useShiftsStore),
  },

  emits: {
    clearShifts(payload: string) {
      const options = ['day', 'week', 'all'];
      return options.includes(payload);
    }
  },

  methods: {
    clearShifts(event: Event) {
      const form = event.currentTarget as HTMLFormElement;

      const startTime = new Date(this.selectedDate);
      const endTime = new Date(this.selectedDate);

      startTime.setHours(0, 0, 0, 0);
      endTime.setHours(23, 59, 59, 999);

      const option = (form.querySelector('input[name="clearOption"]:checked') as HTMLInputElement)?.value;

      switch (option) {
        case 'week':
          // Set the start and end time to the beginning and end of the week
          // getDay() returns 0 for Sunday, so the current date need to minus 7 days (1 week)
          // otherwise, minus 1 day to the current day (Monday = 1 -> 0, Tuesday = 2 -> 1,...)
          // => if the current day is Monday, the start time will be the same as the current date
          // => if the current day is Sunday, the start time will be 6 days before the current date
          startTime.setDate(startTime.getDate() - (startTime.getDay() == 0 ? 7 : startTime.getDay() - 1)); // Monday
          endTime.setDate(endTime.getDate() - (endTime.getDay() == 0 ? 7 : endTime.getDay() - 1) + 7); // Sunday
        // Then filter out shifts like in the 'day' case

        // eslint-disable-next-line no-fallthrough
        case 'day':
          console.log(startTime, endTime);

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
  <form @submit.prevent="clearShifts">
    <span>What shifts do you want to clear?</span>
    <div>
      <input type="radio" id="clear-option-day" v-model="formData.clearOption" name="clearOption" value="day"
        required />
      <label for="clear-option-day">Day</label>
    </div>
    <div>
      <input type="radio" id="clear-option-week" v-model="formData.clearOption" name="clearOption" value="week"
        required />
      <label for="clear-option-week">Week</label>
    </div>
    <div>
      <input type="radio" id="clear-option-all" v-model="formData.clearOption" name="clearOption" value="all"
        required />
      <label for="clear-option-all">All</label>
    </div>

    <div class="actions">
      <ButtonConfirm type="submit">Clear</ButtonConfirm>
    </div>
  </form>
</template>

<style scoped>
input[type='radio'],
input[type='checkbox'] {
  margin-left: 0;
}
</style>
