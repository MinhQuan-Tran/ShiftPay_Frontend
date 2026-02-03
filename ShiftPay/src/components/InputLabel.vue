<script lang="ts">
export default {
  props: {
    labelText: {
      type: String,
      required: true
    },
    forId: {
      type: String,
      default: ''
    },
    toggleValue: {
      type: Boolean,
      default: undefined
    },
    toggleColor: {
      type: String,
      default: 'var(--primary-color)'
    },
    subText: {
      type: String,
      default: ''
    },
    loading: {
      type: Boolean,
      default: false
    }
  },

  emits: ['update:toggleValue']
};
</script>

<template>
  <div :class="['input', { 'is-loading': loading }]" :for="forId">
    <!-- Intentionally not using "for" to let user clicks outside to lose input focus -->
    <div class="input-header">
      <label>{{ labelText }}</label>
      <span v-if="loading" class="loading-spinner"></span>
      <label v-if="toggleValue !== undefined" class="switch">
        <input type="checkbox" :checked="toggleValue" @input="$emit('update:toggleValue', !toggleValue)" />
        <span class="slider round"></span>
      </label>
      <span v-if="subText" class="sub-text">{{ subText }}</span>
    </div>
    <slot></slot>
  </div>
</template>

<style scoped>
.input {
  position: relative;
}

.input-header {
  display: flex;
  align-items: baseline;
  gap: var(--padding-small);
}

label {
  padding-bottom: 2px;
}

/* The switch - the box around the slider */
.switch {
  position: relative;
  display: inline-block;
  width: 2em;
  height: 1em;
  padding: 0.1em;
}

/* Hide default HTML checkbox */
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

/* The slider */
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--input-background-color);
  -webkit-transition: 0.3s;
  transition: 0.3s;
}

.slider:before {
  position: absolute;
  content: '';
  height: 0.8em;
  width: 0.8em;
  left: 0.2em;
  top: 0.2em;
  background-color: white;
  transition: 0.3s;
}

input:checked+.slider {
  background-color: v-bind(toggleColor);
}

input:focus+.slider {
  transition: outline 0s;
  outline: 2px solid var(--primary-color);
}

input:checked+.slider:before {
  left: calc(100% - 0.8em - 0.2em);
}

/* Rounded sliders */
.slider.round {
  border-radius: 34px;
}

.slider.round:before {
  border-radius: 50%;
}

.sub-text {
  color: var(--color-grey);
  font-size: small;
}

.input.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

.loading-spinner {
  width: 0.8em;
  height: 0.8em;
  border: 2px solid var(--input-background-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
