<script lang="ts">
export default {
  // WARNING: animation only works correctly when the button is in the most left position unless direction is set
  props: {
    direction: {
      type: String,
      default: 'to-right',
      validator: (val: string) => ['to-left', 'to-right'].includes(val)
    }
  },

  data() {
    return {
      cursorStartX: 0, // Initial x position of the cursor when pressing down
      confirmed: false,
      isHolding: false,
      startHoldingTime: 0,
      pointerId: 0, // Keep track of finger
      distanceMoved: 0
    };
  },

  emits: [
    'isHolding',
    'click' // Override default click event to only emit when confirmed
  ],

  methods: {
    // https://www.redblobgames.com/making-of/draggable/

    pointerdown(event: PointerEvent) {
      if (event.button !== 0) return; // Only allow left mouse button

      this.pointerId = event.pointerId;
      this.cursorStartX = event.clientX;

      // Add event listeners to the document to handle the pointer movement and release when not hovering over the button
      document.addEventListener('pointermove', this.pointermove);
      document.addEventListener('pointerup', this.pointerup);
      document.addEventListener('pointercancel', this.pointerup);

      this.startHoldingTime = Date.now();

      this.isHolding = true;
      this.$emit('isHolding', this.isHolding);
    },

    pointermove(event: PointerEvent) {
      if (!this.isHolding || this.pointerId !== event.pointerId) {
        return;
      }

      const button = this.$refs.button as HTMLButtonElement;
      const slider = this.$refs.slider as HTMLDivElement;
      const maxDistance = slider.getBoundingClientRect().width - button.getBoundingClientRect().width;

      const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);
      if (this.direction === 'to-left') {
        this.distanceMoved = clamp(this.cursorStartX - event.clientX, 0, maxDistance);
      } else {
        this.distanceMoved = clamp(event.clientX - this.cursorStartX, 0, maxDistance);
      }

      // Confirm if the button has been dragged the full distance and held for at least 300ms
      this.confirmed = (this.distanceMoved == maxDistance && Date.now() - this.startHoldingTime > 300);
    },

    pointerup() {
      const button = this.$refs.button as HTMLButtonElement;

      button.click();

      // Reset button position
      this.distanceMoved = 0;

      this.isHolding = false;
      this.$emit('isHolding', this.isHolding);

      // Remove the event listeners
      document.removeEventListener('pointermove', this.pointermove);
      document.removeEventListener('pointerup', this.pointerup);
      document.removeEventListener('pointercancel', this.pointerup);
    },

    handleClick() {
      if (!this.confirmed) {
        return;
      }

      this.confirmed = false;
      this.$emit('click');
    }
  },

  inheritAttrs: false // Pass all attributes to the button instead of the slider
};
</script>

<template>
  <div ref="slider"
    :class="['slider', direction, { focus: isHolding || (typeof $attrs.class === 'string' && $attrs.class.includes('focus')) }]">
    <span ref="placeholder" class="placeholder">
      {{ direction == "to-left" ? "←" : "" }}
      Slide to confirm
      {{ direction == "to-right" ? "→" : "" }}</span>
    <button ref="button" class="button-confirm" v-bind="$attrs" @pointerdown="pointerdown"
      @click.stop.prevent="handleClick" @touchstart.prevent @dragstart.prevent>
      <slot></slot>
    </button>
  </div>
</template>

<style scoped>
.slider {
  position: relative;
  background-color: rgba(255, 0, 0, 0.25) !important;
  border-radius: var(--border-radius);
  text-align: center;
  flex-shrink: 1;
  flex-grow: 0;
  transition: flex-grow 0.3s ease;
}

.slider.focus {
  flex-grow: 1 !important;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 0.8em;
  letter-spacing: 3px;
  pointer-events: none;
  text-wrap: nowrap;
  opacity: 0;
  transition: all var(--transition-duration) allow-discrete;
}

.slider.focus .placeholder {
  opacity: 0.5;
}

.slider button {
  outline: none;
  user-select: none;
  transition: all 0.2s ease;
  height: 100%;
  z-index: 1;
  transform: translateX(v-bind(distanceMoved + 'px'));
}

.slider.to-left button {
  /* Move to the left instead of right */
  transform: translateX(v-bind(-distanceMoved + 'px'));
}

button.focus {
  width: 100%;
}

.slider.focus button {
  transition: none;
}
</style>
