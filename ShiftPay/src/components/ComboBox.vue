<script lang="ts">
import ButtonConfirm from './ButtonConfirm.vue';
export default {
  components: { ButtonConfirm },
  props: {
    value: String,
    list: Array<String>,
    deletable: {
      type: Boolean,
      default: false
    }
  },

  emits: ['update:value', 'delete-item'],

  data() {
    return {
      isHoldingDelete: false
    };
  },

  computed: {
    filteredList() {
      if (!this.value) return this.list || [];
      return this.list?.filter((item: String) => item.toLowerCase().includes(this.value!.toLowerCase())) || [];
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

      // Hide the datalist when the input is blurred, unless holding delete
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (!this.isHoldingDelete) {
            datalist.classList.remove('show');
            comboBox.style.zIndex = '0';
          }
        }, 10);
      });
    });
  },

  updated() {
    const datalist = this.$refs.datalist as HTMLElement;
    const slot = this.$refs.slot as HTMLElement;
    datalist.style.paddingTop = `${slot.getBoundingClientRect().height}px`;
  },

  methods: {
    handleDelete(itemName: String) {
      console.log('delete', itemName);
      this.$emit('delete-item', itemName);
    },

    setHoldingDelete(val: boolean) {
      this.isHoldingDelete = val;
      // If released, and input is not focused, close datalist
      if (!val) {
        const input = (this.$refs.slot as HTMLDivElement).querySelector('input') as HTMLInputElement;
        const datalist = this.$refs.datalist as HTMLDivElement;
        const comboBox = this.$refs['combo-box'] as HTMLDivElement;
        if (document.activeElement !== input) {
          datalist.classList.remove('show');
          comboBox.style.zIndex = '0';
        }
      }
    }
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
          @mousedown="$emit('update:value', itemName)">
          {{ itemName }}

          <ButtonConfirm v-if="deletable" class="delete-btn danger" direction="to-left" @isHolding="setHoldingDelete"
            @click="handleDelete(itemName)" @mousedown.stop @pointerdown.stop style="margin-left:auto;">
            <div class="icons8-close"></div>
          </ButtonConfirm>
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
  /* Need delay for the click event */
  transition: all var(--transition-duration) allow-discrete 0.2s;
  transform: scaleY(0);
  opacity: 0;
}

.datalist.show {
  transform: scaleY(1);
  opacity: 1;
}

.list {
  box-sizing: border-box;
  padding: 0 var(--padding-small);
  width: 100%;
  max-height: 200px;
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
