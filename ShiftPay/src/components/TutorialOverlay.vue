<script lang="ts">
export interface TutorialStep {
  /** CSS selector for the target element to spotlight (null = full-screen overlay only) */
  target: string | null;
  /** Main instruction text */
  message: string;
  /** Sub-text shown below the message */
  subText?: string;
  /** Step type: 'info' = manual advance only, 'interactive' = waits for user interaction, 'closing' = always shown even after skip */
  type: 'info' | 'interactive' | 'closing';
  /** For interactive steps: the event to listen for on the target that auto-advances */
  waitForEvent?: string;
  /** For interactive steps: whether to just advance on the event (true) or require a "Next" button (false) */
  autoAdvance?: boolean;
  /** Tooltip position preference */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Whether this step targets an element inside a <dialog> */
  inDialog?: boolean;
  /** Whether to advance once the target input has a non-empty value (handles programmatic fills like ComboBox selection) */
  waitForFill?: boolean;
}

const STEPS: TutorialStep[] = [
  // Step 0: Welcome
  {
    target: null,
    message: 'Welcome to ShiftPay! 👋',
    subText: "<b>ShiftPay</b> is a simple shift-tracking app that helps you log your work hours, calculate earnings, and keep everything organised.",
    type: 'info',
    position: 'center'
  },
  // Step 1: Calendar
  {
    target: '#week-schedule',
    message: 'This is your calendar',
    subText: 'Days with shifts are highlighted. The column on the right shows your earnings and hours.',
    type: 'info',
    position: 'bottom'
  },
  // Step 2: Add Shift button
  {
    target: '#add-btn',
    message: 'Add your first shift',
    subText: 'Select here to open the shift form.',
    type: 'interactive',
    waitForEvent: 'click',
    autoAdvance: true,
    position: 'top'
  },
  // Step 3: Workplace field (inside dialog)
  {
    target: '#workplace',
    message: 'Enter your workplace',
    subText: 'Type the name of the company or place you work at.',
    type: 'interactive',
    waitForFill: true,
    autoAdvance: true,
    position: 'top',
    inDialog: true
  },
  // Step 4: Pay rate field (inside dialog)
  {
    target: '#pay-rate',
    message: 'Enter your hourly pay rate',
    subText: 'How much do you earn per hour?',
    type: 'interactive',
    waitForFill: true,
    autoAdvance: true,
    position: 'top',
    inDialog: true
  },
  // Step 5: Start/End time (inside dialog)
  {
    target: '.time-row',
    message: 'Set your shift times',
    subText: 'Adjust the start and end time for your shift.',
    type: 'info',
    position: 'top',
    inDialog: true
  },
  // Step 6: Submit button (inside dialog)
  {
    target: '#add-shift-btn',
    message: 'Save your shift',
    subText: 'Add other information and select the button to add your shift.',
    type: 'interactive',
    waitForEvent: 'click',
    autoAdvance: true,
    position: 'top',
    inDialog: true
  },
  // Step 7: View the shift card — Select to expand
  {
    target: '#shift-list .shift:first-child details.info',
    message: "Here's your shift!",
    subText: 'Select the card to expand it for more details. Here\'s what the icons mean:<br><br>'
      + '<img src="https://img.icons8.com/fluency/48/cash--v1.png" class="inline-icon" /> Earnings<br>'
      + '<img src="https://img.icons8.com/fluency/48/time-card.png" class="inline-icon" /> Billable hours<br>'
      + '<img src="https://img.icons8.com/fluency/48/tea.png" class="inline-icon" /> Unpaid break time',
    type: 'interactive',
    waitForEvent: 'toggle',
    autoAdvance: true,
    position: 'top'
  },
  // Step 8: Edit button
  {
    target: '#shift-list .shift:first-child .actions button',
    message: 'Edit or delete your shift',
    subText: 'Use the Edit button to update shift details or delete the shift.',
    type: 'info',
    position: 'top'
  },
  // Step 10: Week stats
  {
    target: '.weekly.stats, .monthly.stats',
    message: 'Your weekly earnings',
    subText: 'Earnings and hours for each week are shown here. Select a row to see the whole week.',
    type: 'interactive',
    waitForEvent: 'click',
    autoAdvance: true,
    position: 'left'
  },
  // Step 11: Calendar overview
  {
    target: '.calendar',
    message: 'Your calendar',
    subText: 'The selected range is highlighted.',
    type: 'info',
    position: 'bottom'
  },
  // Step 12: Day schedule
  {
    target: '#day-schedule',
    message: 'Day schedule',
    subText: 'This section shows all shifts for the selected day, week or month.',
    type: 'info',
    position: 'top'
  },
  // Step 13: Open main menu (closing step 1) - always shown even after skip
  {
    target: '.menu-btn',
    message: 'Open the menu',
    subText:
      'Select here to open the menu. From here you can log in to sync your data across devices, replay this tutorial, and more.',
    type: 'closing',
    waitForEvent: 'click',
    autoAdvance: true,
    position: 'bottom'
  },
  // Step 14: Login button
  {
    target: '#menu-login-btn',
    message: 'Sync your data',
    subText: 'Log in to back up your shifts and access them from any device.',
    type: 'closing',
    position: 'bottom'
  },
  // Step 15: Tutorial button
  {
    target: '#menu-tutorial-btn',
    message: 'Replay this tutorial',
    subText: 'You can revisit this guide anytime from here.',
    type: 'closing',
    position: 'bottom'
  },
  // Step 16: Completion
  {
    target: null,
    message: "You're all set!",
    subText: 'Start tracking your shifts and earnings. <br>Happy working! 🎉',
    type: 'closing',
    position: 'center'
  }
];

export default {
  data() {
    return {
      active: false,
      currentStepIndex: 0,
      spotlightRect: null as DOMRect | null,
      tooltipStyle: {} as Record<string, string>,
      resizeObserver: null as ResizeObserver | null,
      pollTimer: null as ReturnType<typeof setInterval> | null,
      eventCleanup: null as (() => void) | null,
      dialogCloseCleanup: null as (() => void) | null,
      tooltipTeleportTarget: 'body' as string | Element
    };
  },

  computed: {
    steps(): TutorialStep[] {
      return STEPS;
    },

    currentStep(): TutorialStep {
      return this.steps[this.currentStepIndex];
    },

    isFirstClosingStepIndex(): number {
      return this.steps.findIndex((s) => s.type === 'closing');
    },

    isCenterOverlay(): boolean {
      return !this.currentStep.target || this.currentStep.position === 'center';
    },

    isLastStep(): boolean {
      return this.currentStepIndex === this.steps.length - 1;
    },

    showSkip(): boolean {
      // Show skip button on non-closing steps (closing steps always show)
      return this.currentStep.type !== 'closing';
    },

    showNext(): boolean {
      // Show next button on info and closing steps, but not if the step waits for an event
      return (this.currentStep.type === 'info' || this.currentStep.type === 'closing') && !this.currentStep.waitForEvent;
    },

    spotlightOverlayStyle(): Record<string, string> {
      if (!this.spotlightRect) return {};
      const r = this.spotlightRect;
      const pad = 8;
      return {
        top: `${r.top - pad}px`,
        left: `${r.left - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
        borderRadius: '8px'
      };
    }
  },

  methods: {
    start() {
      this.currentStepIndex = 0;
      this.active = true;
      this.$nextTick(() => this.setupStep());
    },

    advance() {
      this.cleanupStep();
      if (this.currentStepIndex < this.steps.length - 1) {
        this.currentStepIndex++;
        this.$nextTick(() => this.setupStep());
      } else {
        this.finish();
      }
    },

    skip() {
      this.cleanupStep();
      // Open the main menu programmatically and jump to the tutorial button step
      const menuBtn = document.querySelector('.menu-btn') as HTMLElement | null;
      if (menuBtn) {
        // Ensure menu is open (click toggles it)
        if (!menuBtn.classList.contains('open')) {
          menuBtn.click();
        }
      }
      // Jump to the tutorial button step (first closing step with target '#menu-tutorial-btn')
      const tutorialStepIndex = this.steps.findIndex((s: TutorialStep) => s.target === '#menu-tutorial-btn');
      if (tutorialStepIndex >= 0) {
        this.currentStepIndex = tutorialStepIndex;
        this.$nextTick(() => this.setupStep());
      } else {
        this.finish();
      }
    },

    finish() {
      this.cleanupStep();
      this.active = false;
      localStorage.setItem('tutorialCompleted', 'true');
    },

    setupStep() {
      const step = this.currentStep;
      this.tooltipTeleportTarget = 'body';

      if (!step.target) {
        this.spotlightRect = null;
        this.positionTooltipCenter();
        return;
      }

      // Poll for element appearance (handles dialogs opening, elements rendering)
      this.pollForTarget(step.target, (elements) => {
        // For steps inside a dialog, teleport the tooltip into the dialog
        // so it renders in the top-layer above the showModal() backdrop
        if (step.inDialog) {
          const dialog = elements[0].closest('dialog');
          if (dialog) {
            this.tooltipTeleportTarget = dialog;
            this.watchDialogClose(dialog);
          }
        }

        elements[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const rect = this.getCombinedRect(elements);
        this.updateSpotlight(rect);
        this.positionTooltip(rect);
        this.observeResize(elements);
        this.attachEvent(step, elements);
      });
    },

    pollForTarget(selector: string, callback: (elements: Element[]) => void) {
      const step = this.currentStep;

      const tryFind = (): Element[] | null => {
        const els = Array.from(document.querySelectorAll(selector));
        if (els.length === 0) return null;
        // For inDialog steps, wait until the dialog is actually open
        if (step.inDialog) {
          const dialog = els[0].closest('dialog');
          if (!dialog || !dialog.open) return null;
        }
        return els;
      };

      // Try immediately
      const els = tryFind();
      if (els) {
        callback(els);
        return;
      }

      // Poll every 100ms for up to 5 seconds
      let attempts = 0;
      this.pollTimer = setInterval(() => {
        attempts++;
        const targets = tryFind();
        if (targets) {
          clearInterval(this.pollTimer!);
          this.pollTimer = null;
          callback(targets);
        } else if (attempts > 50) {
          clearInterval(this.pollTimer!);
          this.pollTimer = null;
          // Element not found — skip this step
          this.advance();
        }
      }, 100);
    },

    getCombinedRect(elements: Element[]): DOMRect {
      const rects = elements.map((el) => el.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const right = Math.max(...rects.map((r) => r.right));
      return new DOMRect(left, top, right - left, bottom - top);
    },

    updateSpotlight(rect: DOMRect) {
      this.spotlightRect = rect;
    },

    positionTooltip(rect: DOMRect) {
      const step = this.currentStep;
      const pad = 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tooltipW = 300;

      // Calculate available space
      const spaceAbove = rect.top;
      const spaceBelow = vh - rect.bottom;

      let pos = step.position || 'bottom';

      // Auto-adjust if not enough space
      if (pos === 'bottom' && spaceBelow < 160) pos = 'top';
      if (pos === 'top' && spaceAbove < 160) pos = 'bottom';

      const style: Record<string, string> = { position: 'fixed' };

      // Clamp horizontal: always keep tooltip within [pad, vw - tooltipW - pad]
      const clampX = (x: number) => Math.max(pad, Math.min(x, vw - tooltipW - pad));

      switch (pos) {
        case 'top':
          style.bottom = `${vh - rect.top + pad}px`;
          style.left = `${clampX(rect.left + rect.width / 2 - tooltipW / 2)}px`;
          break;
        case 'bottom':
          style.top = `${rect.bottom + pad}px`;
          style.left = `${clampX(rect.left + rect.width / 2 - tooltipW / 2)}px`;
          break;
        case 'left':
          style.top = `${rect.top + rect.height / 2 - 60}px`;
          style.right = `${vw - rect.left + pad}px`;
          break;
        case 'right':
          style.top = `${rect.top + rect.height / 2 - 60}px`;
          style.left = `${rect.right + pad}px`;
          break;
      }

      this.tooltipStyle = style;

      // Post-render clamp: after the tooltip is rendered, check if it overflows and fix
      this.$nextTick(() => {
        const tooltip = document.querySelector('.tutorial-tooltip') as HTMLElement | null;
        if (!tooltip) return;
        const tr = tooltip.getBoundingClientRect();

        // Clamp bottom overflow
        if (tr.bottom > vh - pad) {
          tooltip.style.top = `${vh - tr.height - pad}px`;
          tooltip.style.bottom = 'auto';
        }
        // Clamp top overflow
        if (tr.top < pad) {
          tooltip.style.top = `${pad}px`;
          tooltip.style.bottom = 'auto';
        }
        // Clamp right overflow
        if (tr.right > vw - pad) {
          tooltip.style.left = `${vw - tr.width - pad}px`;
          tooltip.style.right = 'auto';
        }
        // Clamp left overflow
        if (tr.left < pad) {
          tooltip.style.left = `${pad}px`;
          tooltip.style.right = 'auto';
        }
      });
    },

    positionTooltipCenter() {
      this.tooltipStyle = {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    },

    observeResize(elements: Element[]) {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        const rect = this.getCombinedRect(elements);
        this.updateSpotlight(rect);
        this.positionTooltip(rect);
      });
      for (const el of elements) this.resizeObserver.observe(el);
      this.resizeObserver.observe(document.documentElement);
      // Also listen for scroll to reposition
      window.addEventListener('scroll', this.handleScroll, true);
      window.addEventListener('resize', this.handleScroll);
    },

    handleScroll() {
      const step = this.currentStep;
      if (!step.target) return;
      const els = Array.from(document.querySelectorAll(step.target));
      if (els.length > 0) {
        const rect = this.getCombinedRect(els);
        this.updateSpotlight(rect);
        this.positionTooltip(rect);
      }
    },

    watchDialogClose(dialog: HTMLDialogElement) {
      // If the dialog is closed while we're on an inDialog step,
      // rewind to the last non-inDialog step so the user can retry.
      const handler = () => {
        if (!this.active || !this.currentStep.inDialog) return;
        this.cleanupStep();
        // Find the last step before the current block of inDialog steps
        let rewindIndex = this.currentStepIndex;
        while (rewindIndex > 0 && this.steps[rewindIndex - 1].inDialog) {
          rewindIndex--;
        }
        // Go one more back to the step that triggers opening the dialog
        this.currentStepIndex = Math.max(0, rewindIndex - 1);
        this.$nextTick(() => this.setupStep());
      };

      dialog.addEventListener('close', handler, { once: true });
      this.dialogCloseCleanup = () => dialog.removeEventListener('close', handler);
    },

    attachEvent(step: TutorialStep, elements: Element[]) {
      if (step.waitForFill) {
        // Poll the input value — works for both typing and ComboBox dropdown selection
        const input = elements[0] as HTMLInputElement;
        const initialValue = input.value;
        const fillTimer = setInterval(() => {
          if (input.value && input.value !== initialValue) {
            clearInterval(fillTimer);
            setTimeout(() => this.advance(), 150);
          }
        }, 200);
        this.eventCleanup = () => clearInterval(fillTimer);
        return;
      }

      if (!step.waitForEvent) return;

      const handler = () => {
        // If this step is inside a dialog, cancel the dialog-close watcher
        // so the dialog closing after form submission doesn't trigger a rewind
        if (this.dialogCloseCleanup) {
          this.dialogCloseCleanup();
          this.dialogCloseCleanup = null;
        }
        // Small delay to let the UI update (e.g. dialog opening)
        setTimeout(() => this.advance(), 150);
      };

      // Listen on all matched elements — first one to fire advances
      const cleanups: (() => void)[] = [];
      for (const el of elements) {
        el.addEventListener(step.waitForEvent, handler, { once: true });
        cleanups.push(() => el.removeEventListener(step.waitForEvent!, handler));
      }
      this.eventCleanup = () => cleanups.forEach((fn) => fn());
    },

    cleanupStep() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      window.removeEventListener('scroll', this.handleScroll, true);
      window.removeEventListener('resize', this.handleScroll);
      if (this.eventCleanup) {
        this.eventCleanup();
        this.eventCleanup = null;
      }
      if (this.dialogCloseCleanup) {
        this.dialogCloseCleanup();
        this.dialogCloseCleanup = null;
      }
    }
  },

  beforeUnmount() {
    this.cleanupStep();
  }
};
</script>

<template>
  <!-- Backdrop (always teleported to body) -->
  <Teleport to="body">
    <Transition name="tutorial-fade">
      <div v-if="active" class="tutorial-overlay">
        <div class="tutorial-backdrop"
          :class="{ 'tutorial-backdrop--has-spotlight': spotlightRect && !currentStep.inDialog }">
          <div v-if="spotlightRect && !currentStep.inDialog" class="tutorial-spotlight" :style="spotlightOverlayStyle">
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Tooltip (teleported to dialog element for inDialog steps, body otherwise) -->
  <Teleport :to="tooltipTeleportTarget">
    <div v-if="active" class="tutorial-tooltip" :style="tooltipStyle"
      :class="{ 'tutorial-tooltip--center': isCenterOverlay }">
      <div v-if="!isCenterOverlay" class="tutorial-step-indicator">
        {{ currentStepIndex }} / {{ steps.length - 2 }}
        <!-- Exclude the final "You're all set!" step -->
      </div>

      <img v-if="currentStepIndex === 0" src="/logo.png" alt="ShiftPay logo" class="tutorial-logo" />

      <h3 class="tutorial-title">{{ currentStep.message }}</h3>
      <p v-if="currentStep.subText" class="tutorial-sub" v-html="currentStep.subText"></p>

      <div class="tutorial-actions">
        <button v-if="showSkip" class="tutorial-btn tutorial-btn--skip" @click="skip">
          Skip
        </button>

        <button v-if="showNext && !isLastStep" class="tutorial-btn tutorial-btn--next" @click="advance">
          Next
        </button>

        <button v-if="isLastStep" class="tutorial-btn tutorial-btn--finish" @click="finish">
          Got it!
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
}

.tutorial-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

/* Hide backdrop background when spotlight is visible (box-shadow handles the darkening) */
.tutorial-backdrop--has-spotlight {
  background: transparent;
}

.tutorial-spotlight {
  position: fixed;
  z-index: 10001;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  transition: all 0.3s ease;
  background: transparent;
}

.tutorial-tooltip {
  z-index: 10002;
  width: 300px;
  max-width: calc(100vw - 32px);
  padding: 1.2em 1.4em;
  border-radius: 14px;
  background: var(--popup-background-color, #fff);
  color: var(--text-color, #222);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
  animation: tooltip-enter 0.25s ease-out;
}

.tutorial-tooltip--center {
  width: 340px;
  text-align: center;
}

@keyframes tooltip-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tutorial-tooltip--center {
  animation-name: tooltip-center-enter;
}

@keyframes tooltip-center-enter {
  from {
    opacity: 0;
    scale: 0.95;
  }

  to {
    opacity: 1;
    scale: 1;
  }
}

.tutorial-step-indicator {
  font-size: 0.7em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-color-faded, #999);
  margin-bottom: 0.5em;
}

.tutorial-logo {
  display: block;
  width: 72px;
  height: 72px;
  margin: 0 auto 0.6em;
  border-radius: 16px;
}

.tutorial-title {
  margin: 0 0 0.3em;
  font-size: 1.15em;
  font-weight: 700;
}

.tutorial-sub {
  margin: 0 0 1em;
  font-size: 0.9em;
  line-height: 1.45;
  color: var(--text-color-faded, #666);
}

.tutorial-actions {
  display: flex;
  gap: 0.6em;
  justify-content: flex-end;
}

.tutorial-tooltip--center .tutorial-actions {
  justify-content: center;
}

.tutorial-btn {
  padding: 0.5em 1.2em;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9em;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}

.tutorial-btn:hover {
  opacity: 0.85;
  box-shadow: none;
}

.tutorial-btn--skip {
  background: transparent;
  color: var(--text-color-faded, #888);
}

.tutorial-btn--skip:hover {
  background: var(--hover-overlay, rgba(0, 0, 0, 0.05));
}

.tutorial-btn--next {
  background: var(--primary-color, #47acff);
  color: var(--text-color-black, #000);
}

.tutorial-btn--finish {
  background: var(--success-color, #64ff64);
  color: var(--text-color-black, #000);
}

/* Fade transition for the whole overlay */
.tutorial-fade-enter-active,
.tutorial-fade-leave-active {
  transition: opacity 0.3s ease;
}

.tutorial-fade-enter-from,
.tutorial-fade-leave-to {
  opacity: 0;
}
</style>
