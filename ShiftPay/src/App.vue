<script lang="ts">
import api, { initBeforeUnloadWarning } from '@/api';
import Shift from '@/models/Shift';
import { STATUS, type DateRange } from './types';

import packageJson from '@/../package.json';

import { mapStores } from 'pinia';
import { useAuthStore } from './stores/authStore';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import MainMenu from '@/components/MainMenu.vue';
import WeekSchedule from '@/components/WeekSchedule.vue';
import DaySchedule from '@/components/DaySchedule.vue';
import SyncDataDialog from '@/components/SyncDataDialog.vue';
import ImportDataDialog from '@/components/ImportDataDialog.vue';
import ChangelogDialog from '@/components/ChangelogDialog.vue';
import TutorialOverlay from '@/components/TutorialOverlay.vue';

export default {
  data() {
    const start = new Date(new Date().setHours(0, 0, 0, 0));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      selectedRange: { start, end } as DateRange,
      menuOpened: false
    };
  },

  methods: {
    showSyncDialog() {
      console.log('Showing sync dialog');
      (this.$refs['sync-dialog'] as any).showModal();
    },
    showImportDialog() {
      this.menuOpened = false;
      (this.$refs['import-dialog'] as any).showModal();
    },
    showChangelogDialog() {
      this.menuOpened = false;
      (this.$refs['changelog-dialog'] as any).showFullHistory();
    },
    handleSyncComplete() {
      // Clear the pending flag so stores fetch from server
      localStorage.removeItem('syncPending');
      this.shiftsStore.fetch();
      this.workInfosStore.fetch();
      this.shiftTemplatesStore.fetch();
    },
    startTutorial() {
      this.menuOpened = false;
      (this.$refs.tutorial as any).start();
    },

    async handleLogin() {
      // Close the menu first
      this.menuOpened = false;

      await this.authStore.login();

      // Set stores to loading state while we check for data and potentially sync
      this.shiftsStore.status = STATUS.Loading;
      this.workInfosStore.status = STATUS.Loading;
      this.shiftTemplatesStore.status = STATUS.Loading;

      // Check if there's any data online
      const shifts = await api.shifts.fetch();
      const parsed = Shift.parseAll(shifts);

      if (parsed.shifts.length === 0) {
        // Set flag so stores keep using local data until user decides
        localStorage.setItem('syncPending', 'true');
        // Show sync dialog to let user decide
        this.showSyncDialog();
      } else {
        // Online data exists - clear any pending flag and fetch everything
        localStorage.removeItem('syncPending');
        this.shiftsStore.fetch();
        this.workInfosStore.fetch();
        this.shiftTemplatesStore.fetch();
      }
    }
  },

  computed: {
    ...mapStores(useAuthStore, useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore),
  },

  components: {
    MainMenu,
    WeekSchedule,
    DaySchedule,
    SyncDataDialog,
    ImportDataDialog,
    ChangelogDialog,
    TutorialOverlay
  },

  async mounted() {
    // Enable Auto Persist
    this.shiftsStore.enableAutoPersist();
    this.shiftTemplatesStore.enableAutoPersist();
    this.workInfosStore.enableAutoPersist();
    this.shiftSessionStore.enableAutoPersist();

    // Fetch initial data
    this.shiftsStore.fetch();
    this.shiftTemplatesStore.fetch();
    this.workInfosStore.fetch();
    this.shiftSessionStore.fetch();

    // Show changelog if app version is different (skip if tutorial not completed)
    if (localStorage.getItem('tutorialCompleted') === 'true') {
      (this.$refs['changelog-dialog'] as any).checkAndShow();
    } else {
      // If tutorial not completed, set current version to avoid showing changelog on first run
      localStorage.setItem('appVersion', packageJson.version);
    }

    // Show sync dialog if user previously clicked "Decide Later"
    if (this.authStore.isAuthenticated && localStorage.getItem('syncPending') === 'true') {
      this.showSyncDialog();
    }

    // Notify user if not on the main site
    if (!window.location.hostname.includes('shiftpay-mqtran.netlify.app') && !window.location.hostname.includes('localhost')) {
      alert('The website is being moved to [ https://shiftpay-mqtran.netlify.app/ ] \n\nUsing the menu on the top right: \n- Please download and upload the data manually to the new site. \n- Alternatively, please login to sync data. \n\nThe current site will be taken down soon. Thank you!');
    }

    // Warn user before leaving if there are pending API writes
    initBeforeUnloadWarning();

    // Auto-start tutorial for first-time visitors
    if (localStorage.getItem('tutorialCompleted') !== 'true') {
      this.$nextTick(() => this.startTutorial());
    }
  }
};
</script>

<template>
  <div class="header">
    <div class="brand">
      <img src="/logo.png" alt="ShiftPay logo" class="logo" />
      <b>ShiftPay</b>
    </div>
    <div class="menu-btn" @click="menuOpened = !menuOpened" :class="{ open: menuOpened }">
      <div class="bar"></div>
      <div class="bar"></div>
      <div class="bar"></div>
      <MainMenu v-if="menuOpened" @login="handleLogin" @import="showImportDialog" @tutorial="startTutorial"
        @changelog="showChangelogDialog"></MainMenu>
    </div>
  </div>

  <SyncDataDialog ref="sync-dialog" @complete="handleSyncComplete" />
  <ImportDataDialog ref="import-dialog" />

  <WeekSchedule v-model:selected-range="selectedRange" />
  <hr />
  <DaySchedule :selected-range="selectedRange" />

  <ChangelogDialog ref="changelog-dialog" />
  <TutorialOverlay ref="tutorial" />
</template>

<style scoped>
.header {
  position: sticky;
  top: 12px;
  margin-bottom: 12px;
  z-index: 1;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: var(--padding) calc(var(--padding) * 2);
  font-size: 1.25rem;
  background: transparent;
  box-shadow: 0 10px 10px rgba(0, 0, 0, 0.15);
  border-radius: 40px;
  isolation: isolate;
}

.header::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: light-dark(rgba(255, 255, 255, 0.55), rgba(18, 18, 18, 0.45));
  border: 1px solid light-dark(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.22));
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  pointer-events: none;
  z-index: 0;
}

.header>* {
  position: relative;
  z-index: 1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  height: 32px;
}

.brand .shift {
  color: var(--primary-color);
}

.brand .pay {
  color: rgb(0, 255, 0);
}

.menu-btn {
  width: 24px;
  height: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  position: relative;
  background: transparent;
}

.menu-btn .bar {
  width: 100%;
  height: 3.5px;
  background-color: light-dark(#121212, #f4f4f4);
  border-radius: 2px;
  transition: all 0.3s ease;
}

/* Open state styles */
.menu-btn.open .bar:nth-child(1) {
  transform: rotate(45deg);
  top: 50%;
  position: absolute;
}

.menu-btn.open .bar:nth-child(2) {
  opacity: 0;
}

.menu-btn.open .bar:nth-child(3) {
  transform: rotate(-45deg);
  top: 50%;
  position: absolute;
}

hr {
  margin: var(--padding);
}
</style>
