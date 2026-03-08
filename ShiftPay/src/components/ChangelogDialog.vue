<script lang="ts">
import packageJson from '@/../package.json';
import changelog from '@/../changelog.json';

import BaseDialog from '@/components/BaseDialog.vue';
import type { ChangelogEntry } from '@/types';

export default {
  components: { BaseDialog },

  data() {
    return {
      showingFullHistory: false,
      shouldMarkVersionSeenOnClose: false
    };
  },

  computed: {
    currentAppVersion(): string {
      return packageJson.version;
    },

    allChanges(): ChangelogEntry[] {
      return [...(changelog as ChangelogEntry[])].reverse();
    },

    versionChanges(): ChangelogEntry[] {
      const currentVersion = localStorage.getItem('appVersion')?.split('.').map(Number) || [0, 0, 0];

      return (changelog as ChangelogEntry[])
        .filter((log) => {
          const logVersion = log.version.split('.').map(Number);

          // Compare version numbers
          for (let i = 0; i < logVersion.length; i++) {
            if (logVersion[i] > currentVersion[i]) {
              return true;
            } else if (logVersion[i] < currentVersion[i]) {
              return false;
            }
          }

          return false;
        })
        .reverse();
    },

    displayedChanges(): ChangelogEntry[] {
      return this.showingFullHistory ? this.allChanges : this.versionChanges;
    },

    hasDisplayedChanges(): boolean {
      return this.displayedChanges.length > 0;
    }
  },

  methods: {
    openDialog(showFullHistory = false, markVersionSeenOnClose = false) {
      this.showingFullHistory = showFullHistory;
      this.shouldMarkVersionSeenOnClose = markVersionSeenOnClose;
      (this.$refs.dialog as any).showModal();
    },

    showModal() {
      this.openDialog();
    },

    showFullHistory() {
      this.openDialog(true, false);
    },

    closeDialog() {
      (this.$refs.dialog as any).closeDialog();
    },

    handleClose() {
      if (this.shouldMarkVersionSeenOnClose) {
        // Mark current version as seen only for update-triggered dialog opens.
        localStorage.setItem('appVersion', this.currentAppVersion);
      }

      // Reset mode for the next open.
      this.showingFullHistory = false;
      this.shouldMarkVersionSeenOnClose = false;
    },

    /** Check if there are updates and show the dialog if needed */
    checkAndShow(): boolean {
      const storedVersion = localStorage.getItem('appVersion');
      if (storedVersion !== this.currentAppVersion) {
        this.openDialog(false, true);
        return true;
      }
      return false;
    }
  }
};
</script>

<template>
  <BaseDialog ref="dialog" title="What's new" @close-dialog="handleClose">
    <div class="changelog-content">
      <div v-if="hasDisplayedChanges">
        <div v-for="log in displayedChanges" :key="log.version" class="changelog-entry">
          <div class="info">
            <h2 class="version">{{ log.version }}</h2>
            <span class="date">{{ new Date(log.date).toLocaleDateString() }}</span>
          </div>
          <hr />
          <ul class="changes">
            <li v-for="(change, index) in log.changes" :key="index">{{ change }}</li>
          </ul>
        </div>
      </div>
      <div v-else class="no-updates">
        <p>You're up to date!</p>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.changelog-content {
  overflow-y: auto;
}

.changelog-entry {
  margin-bottom: 1rem;
}

.changelog-entry:last-child {
  margin-bottom: 0;
}

.info {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin: 0 var(--padding);
}

.version {
  margin: 0;
  font-size: 1.25rem;
}

.date {
  color: var(--text-muted, #666);
  font-size: 0.9rem;
}

hr {
  margin: 0.5rem var(--padding);
  border: none;
  border-top: 1px solid var(--border-color, #ddd);
}

.changes {
  margin: 0;
  padding-left: calc(var(--padding) + 1.25rem);
  padding-right: var(--padding);
}

.changes li {
  margin: 0.25rem 0;
}

.no-updates {
  text-align: center;
  padding: 2rem var(--padding);
  color: var(--text-muted, #666);
}

.no-updates p {
  margin: 0;
}
</style>
