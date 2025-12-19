<script lang="ts">
import packageJson from '@/../package.json';
import changelog from '@/../changelog.json';

import { mapStores } from 'pinia';
import { useAuthStore } from './stores/authStore';
import { useShiftsStore } from '@/stores/shiftsStore';
import { useShiftTemplatesStore } from '@/stores/shiftTemplatesStore';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import { useShiftSessionStore } from '@/stores/shiftSessionStore';

import MainMenu from '@/components/MainMenu.vue';
import WeekSchedule from '@/components/WeekSchedule.vue';
import DaySchedule from '@/components/DaySchedule.vue';
import BaseDialog from '@/components/BaseDialog.vue';

export default {
  data() {
    return {
      selectedDate: new Date(new Date().setHours(0, 0, 0, 0)),
      openChangelogDialog: Function,
      menuOpened: false
    };
  },

  methods: {
    versionChanges(): {
      version: string;
      date: string;
      changes: string[];
    }[] {
      const currentVersion = localStorage.getItem('appVersion')?.split('.').map(Number) || [0, 0, 0];

      return changelog
        .filter((log: { version: string; date: string; changes: string[]; }) => {
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
    handleCloseChangelogDiaglog() {
      console.log('here');
      localStorage.setItem('appVersion', packageJson.version);
    }
  },

  computed: {
    ...mapStores(useAuthStore, useShiftsStore, useShiftTemplatesStore, useWorkInfosStore, useShiftSessionStore),
  },

  components: {
    MainMenu,
    WeekSchedule,
    DaySchedule,
    BaseDialog
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

    // Show changelog if app version is different
    const currentVersion = localStorage.getItem('appVersion');
    if (currentVersion !== packageJson.version) {
      (this.$refs['changelog-dialog'] as any).showModal();
    }

    // Notify user if not on the main site
    if (!window.location.hostname.includes('shiftpay-mqtran.netlify.app') && !window.location.hostname.includes('localhost')) {
      alert('The website is being moved to [ https://shiftpay-mqtran.netlify.app/ ] \n\nUsing the menu on the top right: \n- Please download and upload the data manually to the new site. \n- Alternatively, please login to sync data. \n\nThe current site will be taken down soon. Thank you!');
    }
  }
};
</script>

<template>
  <div class="header">
    <h1>ShiftPay</h1>
    <div class="menu-btn" @click="menuOpened = !menuOpened" :class="{ open: menuOpened }">
      <div class="bar"></div>
      <div class="bar"></div>
      <div class="bar"></div>
      <MainMenu v-if="menuOpened"></MainMenu>
    </div>
  </div>

  <WeekSchedule v-model:selected-date="selectedDate" />
  <hr />
  <DaySchedule :selected-date="selectedDate" />

  <BaseDialog ref="changelog-dialog" title="What's new" @close-dialog="handleCloseChangelogDiaglog">
    <div class="what-new">
      <div v-for="log in versionChanges()" :key="log.version">
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
  </BaseDialog>
</template>

<style scoped>
.header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.menu-btn {
  width: 40px;
  height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  position: relative;
}

.menu-btn .bar {
  width: 100%;
  height: 4px;
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

.what-new {
  overflow-y: auto;
}

.what-new .info {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin: 0 var(--padding);
}

.what-new .version {
  margin: 0;
}
</style>
