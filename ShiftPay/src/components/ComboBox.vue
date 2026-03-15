<script lang="ts">
export default {
  props: {
    value: String,
    list: Array<String>,
    deletable: {
      type: Boolean,
      default: false
    }
  },

  emits: ['update:value', 'delete-item'],

  computed: {
    filteredList() {
      if (!this.value) return this.list || [];

      return this.list?.filter((item) => item.toLowerCase().includes(this.value!.toLowerCase())) || [];
    }
  },

  created() {
    this.$nextTick(() => {
      const input = (this.$refs.slot as HTMLDivElement).querySelector('input') as HTMLInputElement;
      const comboBox = this.$refs['combo-box'] as HTMLDivElement;
      const datalist = this.$refs.datalist as HTMLDivElement;
      const slot = this.$refs.slot as HTMLElement;

      // Disable input autocomplete
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-autocomplete', 'inline');

      // Show the datalist when the input is focused
      input.addEventListener('focus', () => {
        datalist.classList.add('show');
        comboBox.style.zIndex = '1';
        datalist.style.paddingTop = `${slot.getBoundingClientRect().height}px`;
      });

      // Hide the datalist when the input is blurred
      input.addEventListener('blur', () => {
        // Fire the click event after the hide the datalist
        datalist.classList.remove('show');
        setTimeout(() => {
          comboBox.style.zIndex = '0';
        }, 500);
      });
    });
  },

  updated() {
    const datalist = this.$refs.datalist as HTMLElement;
    const slot = this.$refs.slot as HTMLElement;

    datalist.style.paddingTop = `${slot.getBoundingClientRect().height}px`;
  }
};
</script>

<template>
  <div class="combo-box" ref="combo-box">
    <div ref="slot">
      <slot></slot>
    </div>

    <div ref="datalist" class="datalist">
      <div class="list">
        <div v-for="(itemName, index) in filteredList" :key="index" class="item"
          @click="$emit('update:value', itemName)">
          {{ itemName }}
          <button class="delete-btn danger" type="button" v-if="deletable" @click.stop="$emit('delete-item', itemName)">
            <div class="icons8-close"></div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.combo-box {
  position: relative;
  border-radius: var(--border-radius);
}

.datalist {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  border: 1px solid var(--text-color-faded);
  box-sizing: border-box;
  overflow: hidden;
  width: 100%;
  font-size: inherit;
  background-color: var(--input-background-color);
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.5);
  border-radius: var(--border-radius);
  transform-origin: top;
  /* No delay when closing */
  transition: all 0.25s allow-discrete;
  transform: scaleY(0);
  opacity: 0;
}

.datalist.show {
  /* Small delay when showing */
  transition-delay: 0.2s;
  transform: scaleY(1);
  opacity: 1;
}

.list {
  box-sizing: border-box;
  padding: 0 var(--padding-small);
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
}

.list .item {
  border-radius: var(--border-radius);
  padding: var(--padding-small) var(--padding);
  height: fit-content;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 1em;
  text-wrap: balance;
  text-wrap: pretty;
  word-break: break-word;
  overflow-wrap: break-word;
}

.list .item:first-child {
  margin-top: var(--padding-small);
}

.list .item:last-child {
  margin-bottom: var(--padding-small);
}

.list .item:hover {
  background-color: var(--hover-overlay);
}

.list .item .delete-btn {
  font-size: inherit;
  height: 1.5em;
  width: 1.5em;
  padding: var(--padding-small);
  box-sizing: border-box;
  z-index: 1;
}
</style>
