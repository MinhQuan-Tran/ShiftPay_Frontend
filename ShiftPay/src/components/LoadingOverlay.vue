<script lang="ts">
export default {
  name: 'LoadingOverlay',
  props: {
    active: { type: Boolean, required: true },
  }
};
</script>

<template>
  <Transition name="fade">
    <div v-if="active" class="overlay" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: color-mix(in oklab, var(--background-color) 70%, transparent);
  backdrop-filter: blur(2px);
  z-index: 5;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(0, 0, 0, 0.2);
  border-top-color: var(--primary-color, #888);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity .15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>