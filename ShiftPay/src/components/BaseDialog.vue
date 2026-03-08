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
      <div class="divider"></div>
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
  background: light-dark(rgba(255, 255, 255, 0.75), rgba(24, 24, 24, 0.5));
  border: 1px solid light-dark(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.18));
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  width: clamp(300px, 85dvw, 500px);
  max-height: 90dvh;
  overflow-y: hidden;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  padding: 0;
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
  margin-left: var(--padding);
}

.close-btn {
  font-size: inherit;
  line-height: inherit;
  font-weight: normal;
  background: transparent;
  user-select: none;
  width: auto;
  border-radius: 0;
}

.close-btn,
.close-btn:hover {
  box-shadow: none;
}

.close-btn:hover,
.close-btn:focus {
  opacity: 1;
  outline: none;
  background-color: var(--danger-color);
}

.divider {
  width: 100%;
  height: 2px;
  flex-shrink: 0;
  background-color: var(--primary-color);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: var(--padding);
}
</style>
