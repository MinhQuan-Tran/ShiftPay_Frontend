<script lang="ts">
import { mapStores } from 'pinia';
import WorkInfo, { isLegacyRateId, type WorkProfile, type PayRateOption } from '@/models/WorkInfo';
import { useWorkInfosStore } from '@/stores/workInfosStore';
import BaseDialog from './BaseDialog.vue';
import InputLabel from './InputLabel.vue';

function newProfile(): WorkProfile {
  return { id: crypto.randomUUID(), position: '', location: '', payRates: [] };
}

function newDraft(): Pick<WorkInfo, 'id' | 'workplace' | 'profiles'> {
  return { id: crypto.randomUUID(), workplace: '', profiles: [newProfile()] };
}

export default {
  components: { BaseDialog, InputLabel },

  data() {
    return {
      selectedWorkplace: '',
      draft: newDraft(),
      saving: false,
      error: '',
      saved: false
    };
  },

  computed: {
    ...mapStores(useWorkInfosStore)
  },

  methods: {
    showModal(workplace?: string) {
      this.loadWorkplace(workplace ?? this.workInfosStore.workInfos.keys().next().value ?? '');
      (this.$refs.baseDialog as InstanceType<typeof BaseDialog>).showModal();
    },

    loadWorkplace(workplace: string) {
      const existing = this.workInfosStore.workInfos.get(workplace);
      this.selectedWorkplace = existing ? workplace : '';
      this.draft = existing
        ? { id: existing.id, workplace: existing.workplace, profiles: structuredClone(existing.toDTO().profiles) }
        : newDraft();
      this.error = '';
      this.saved = false;
    },

    addProfile() {
      this.draft.profiles.push(newProfile());
      this.saved = false;
    },

    addRate(profile: WorkProfile) {
      profile.payRates.push({ id: crypto.randomUUID(), name: '', hourlyRate: 0 });
      this.saved = false;
    },

    isLegacyRate(rate: PayRateOption): boolean {
      return isLegacyRateId(rate.id);
    },

    async save() {
      this.error = '';
      this.saved = false;
      this.saving = true;
      try {
        const workInfo = WorkInfo.parse(this.draft);
        if (!this.selectedWorkplace && this.workInfosStore.workInfos.has(workInfo.workplace)) {
          throw new Error('This workplace already exists. Select it above to edit its profiles.');
        }
        await this.workInfosStore.save(workInfo);
        this.loadWorkplace(workInfo.workplace);
        this.saved = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Unable to save work details.';
      } finally {
        this.saving = false;
      }
    },

    async deleteWorkplace() {
      if (!this.selectedWorkplace || !confirm(`Delete work details for ${this.selectedWorkplace}? Saved shifts will stay unchanged.`)) {
        return;
      }
      this.error = '';
      this.saving = true;
      try {
        await this.workInfosStore.delete(this.selectedWorkplace);
        this.loadWorkplace(this.workInfosStore.workInfos.keys().next().value ?? '');
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Unable to delete work details.';
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<template>
  <BaseDialog ref="baseDialog" title="Work details">
    <form @submit.prevent="save" @input="saved = false">
      <fieldset :disabled="saving" class="editor">
        <InputLabel label-text="Workplace" for-id="work-details-workplace">
          <select id="work-details-workplace" aria-label="Workplace" :value="selectedWorkplace"
            @change="loadWorkplace(($event.target as HTMLSelectElement).value)">
            <option v-for="workplace in workInfosStore.workInfos.keys()" :key="workplace" :value="workplace">
              {{ workplace }}
            </option>
            <option value="">+ Add workplace</option>
          </select>
        </InputLabel>

        <InputLabel v-if="!selectedWorkplace" label-text="Workplace name" for-id="work-details-name">
          <input id="work-details-name" aria-label="Workplace name" v-model="draft.workplace"
            placeholder="e.g. Company name" maxlength="200" required />
        </InputLabel>

        <p class="hint">Add a profile for each position or location, then choose its rate when entering a shift.</p>

        <fieldset v-for="(profile, profileIndex) in draft.profiles" :key="profile.id" class="profile">
          <legend>Profile {{ profileIndex + 1 }}</legend>
          <div class="profile-fields">
            <InputLabel label-text="Position (optional)" :for-id="`profile-position-${profile.id}`">
              <input :id="`profile-position-${profile.id}`" :aria-label="`Profile ${profileIndex + 1} position`"
                v-model="profile.position" placeholder="e.g. Barista" maxlength="200" />
            </InputLabel>
            <InputLabel label-text="Location (optional)" :for-id="`profile-location-${profile.id}`">
              <input :id="`profile-location-${profile.id}`" :aria-label="`Profile ${profileIndex + 1} location`"
                v-model="profile.location" placeholder="e.g. City branch" maxlength="200" />
            </InputLabel>
          </div>

          <div v-for="(rate, rateIndex) in profile.payRates" :key="rate.id" class="rate-row">
            <InputLabel :label-text="isLegacyRate(rate) ? 'Rate name (optional)' : 'Rate name'"
              :for-id="`rate-name-${profile.id}-${rate.id}`">
              <input :id="`rate-name-${profile.id}-${rate.id}`" :aria-label="`Profile ${profileIndex + 1} rate ${rateIndex + 1} name`"
                v-model="rate.name" placeholder="e.g. Weekend" maxlength="100" :required="!isLegacyRate(rate)" />
            </InputLabel>
            <InputLabel label-text="Hourly rate" :for-id="`rate-amount-${profile.id}-${rate.id}`">
              <input :id="`rate-amount-${profile.id}-${rate.id}`" :aria-label="`Profile ${profileIndex + 1} rate ${rateIndex + 1} hourly rate`"
                type="number" v-model.number="rate.hourlyRate" min="0"
                step="0.01" required />
            </InputLabel>
            <button type="button" class="danger remove-rate" :aria-label="`Remove rate ${rateIndex + 1}`"
              @click="profile.payRates.splice(rateIndex, 1); saved = false">×</button>
          </div>

          <div class="profile-actions">
            <button type="button" @click="addRate(profile)">+ Add pay rate</button>
            <button type="button" class="danger" @click="draft.profiles.splice(profileIndex, 1); saved = false">
              Remove profile
            </button>
          </div>
        </fieldset>

        <button type="button" @click="addProfile">+ Add position or location</button>
      </fieldset>

      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-else-if="saved" role="status" class="hint">Work details saved.</p>

      <div class="actions">
        <button v-if="selectedWorkplace" type="button" class="danger" :disabled="saving" @click="deleteWorkplace">
          Delete workplace
        </button>
        <button type="submit" class="primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save work details' }}</button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped>
.editor,
.profile {
  display: flex;
  flex-direction: column;
  gap: var(--padding);
  min-width: 0;
}

.editor {
  border: 0;
  padding: 0;
}

.profile {
  border: 1px solid var(--text-color-faded);
  border-radius: var(--border-radius);
  padding: var(--padding);
}

.profile-fields,
.rate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: end;
  gap: var(--padding-small);
}

.rate-row {
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) auto;
}

.remove-rate {
  padding: var(--padding-small);
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--padding-small);
}

.hint {
  margin: 0;
  color: var(--text-color-faded);
  font-size: small;
}

.error {
  margin: 0;
  color: var(--danger-color);
}

select {
  width: 100%;
  padding: var(--padding);
  font: inherit;
  color: var(--text-color);
  background: var(--input-background-color);
  border: 0;
  border-radius: var(--border-radius);
}
</style>
