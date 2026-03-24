<script lang="ts">
export default {
  props: {
    title: {
      type: String,
      required: true
    },
    resetForms: {
      type: Boolean,
      default: false
    }
  },
  // Emitting events allows parent components to access methods in this component
  emits: ['showModal', 'closeDialog'],
  methods: {
    showModal() {
      const dialog = this.$refs.dialog as HTMLDialogElement;
      dialog.showModal();
    },

    closeDialog() {
      const dialog = this.$refs.dialog as HTMLDialogElement;
      if (this.resetForms) {
        this.$el.querySelectorAll('form').forEach((form: HTMLFormElement) => {
          form.reset();
        });
      }
      dialog.close();
      this.$emit('closeDialog');
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.$emit('showModal', this.showModal);
    });
  }
};
</script>

<template>
  <dialog ref="dialog">
    <div class="dialog">
      <div class="header">
        <b class="title">{{ title }}</b>
        <button class="close-btn" @click="closeDialog">
          <div class="icons8-close"></div>
        </button>
      </div>
      <div class="content">
        <slot></slot>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog {
  border: none;
  outline: none;
  border-radius: var(--border-radius);
  backdrop-filter: blur(50px) saturate(200%);
  -webkit-backdrop-filter: blur(50px) saturate(200%);
  width: clamp(300px, 85dvw, 500px);
  max-height: 90dvh;
  overflow-y: hidden;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  padding: 0;
  z-index: -1000;
  border: 1px solid light-dark(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.16));
}

@media (prefers-color-scheme: light) {
  dialog {
    background: linear-gradient(315deg, rgba(255, 255, 255, 0.7) 0%, rgba(240, 240, 240, 0.7) 100%);
    border: 1px solid rgba(255, 255, 255, 0.75);
  }
}

@media (prefers-color-scheme: dark) {
  dialog {
    background: linear-gradient(315deg, rgba(51, 51, 51, 0.3) 0%, rgba(14, 14, 14, 0.3) 100%);
    border: 1px solid rgba(0, 0, 0, 0.25);
  }
}

dialog::backdrop {
  animation: dialog-backdrop 0.3s ease forwards;
}

@keyframes dialog-backdrop {
  from {
    backdrop-filter: blur(0);
  }

  to {
    backdrop-filter: blur(5px);
  }
}

/* To select and change the display of the dialog div, not interfering with the Core dialog display */
.dialog {
  width: inherit;
  max-height: inherit;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: transparent;
  z-index: -1000;
}

.dialog *:not(input, select, textarea, button, .datalist) {
  background-color: transparent;
}

.header {
  display: flex;
  justify-content: space-between;
  padding: 0;
  font-size: 1.25em;
  line-height: 1.25em;
  align-items: center;
  border-bottom: 2px solid var(--primary-color);
}

.title {
  text-align: left;
  margin: 0;
  margin-left: calc(var(--padding) * 1.5);
}

.close-btn {
  font-size: inherit;
  line-height: inherit;
  font-weight: normal;
  background: transparent;
  user-select: none;
  width: auto;
  border-radius: 0;
  outline: none;
  transition: all 0.25s;
}

.close-btn,
.close-btn:hover {
  box-shadow: none;
  outline: none;
}

.close-btn:hover,
.close-btn:focus {
  opacity: 1;
  outline: none;
  background-color: var(--danger-color);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: var(--padding);
}

@media (prefers-color-scheme: light) {
  .content {
    background-color: rgba(0, 0, 0, 0.05) !important;
  }
}

@media (prefers-color-scheme: dark) {
  .content {
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
  }
}
</style>
