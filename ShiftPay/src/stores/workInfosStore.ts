import { defineStore } from 'pinia';
import api from '@/api';
import WorkInfo, { isLegacyRateId, legacyRateId } from '@/models/WorkInfo';
import { useAuthStore } from './authStore';
import { STATUS, type Status } from '@/types';
import { withStatus } from '@/utils';

function useRemoteData(): boolean {
  return useAuthStore().isAuthenticated && localStorage.getItem('syncPending') !== 'true';
}

function mergeDetails(existing: WorkInfo | undefined, incoming: WorkInfo): WorkInfo {
  if (!existing) return WorkInfo.parse(incoming);
  const merged = WorkInfo.parse(existing);
  for (const profile of incoming.profiles) {
    const current = merged.profiles.find((entry) => entry.id === profile.id);
    if (!current) {
      merged.profiles.push({ ...profile, payRates: profile.payRates.map((rate) => ({ ...rate })) });
      continue;
    }
    current.position ||= profile.position;
    current.location ||= profile.location;
    for (const rate of profile.payRates) {
      if (!current.payRates.some((entry) => entry.id === rate.id)) current.payRates.push({ ...rate });
    }
  }
  return merged;
}

export const useWorkInfosStore = defineStore('workInfos', {
  state: () => ({
    workInfos: new Map<string, WorkInfo>(),
    status: STATUS.Ready as Status
  }),

  actions: {
    async fetch(): Promise<void> {
      await withStatus(this, async () => {
        const local = localStorage.getItem('workInfos') || localStorage.getItem('prevWorkInfos') || '[]';
        const data: unknown = useRemoteData() ? await api.workInfos.fetch() : JSON.parse(local);
        // Older backups stored an object keyed by workplace instead of an array.
        const entries = Array.isArray(data)
          ? data
          : Object.entries(data ?? {}).map(([workplace, info]) => ({
              ...(Array.isArray(info) || typeof info === 'number'
                ? { payRates: info }
                : typeof info === 'object' && info !== null
                  ? info
                  : {}),
              workplace
            }));
        const infos = entries.map((entry) => WorkInfo.parse(entry));
        this.workInfos = new Map(infos.map((info) => [info.workplace, info]));
        localStorage.removeItem('prevWorkInfos');
      });
    },

    /** Remember a custom amount without replacing named rates or other profiles. */
    async add(workplace: string, payRate: number, profileId = 'legacy'): Promise<void> {
      await withStatus(this, async () => {
        const normalized = new WorkInfo({ workplace, payRates: [payRate] });
        const existing = this.workInfos.get(normalized.workplace);
        const info = existing ? WorkInfo.parse(existing) : new WorkInfo({ workplace: normalized.workplace });
        let profile = info.profiles.find((entry) => entry.id === profileId);
        // A saved template can reference a profile that has since been deleted.
        if (!profile && profileId !== 'legacy') return;
        if (profile?.payRates.some((rate) => rate.hourlyRate === payRate)) return;
        if (!profile) {
          profile = { id: 'legacy', payRates: [] };
          info.profiles.push(profile);
        }
        const rememberedId = legacyRateId(payRate);
        const idInUse = profile.payRates.some((rate) => rate.id === rememberedId);
        profile.payRates.push({
          id: idInUse ? crypto.randomUUID() : rememberedId,
          name: idInUse ? 'Custom' : '',
          hourlyRate: payRate
        });
        const result = useRemoteData() ? WorkInfo.parse(await api.workInfos.createOrUpdate(info)) : info;
        this.workInfos.set(result.workplace, result);
      });
    },

    /** Replace explicitly edited details. A workplace's name stays stable. */
    async save(workInfo: WorkInfo): Promise<void> {
      await withStatus(this, async () => {
        const info = WorkInfo.parse(workInfo);
        const existing = this.workInfos.get(info.workplace);
        const sameId = [...this.workInfos.values()].find((entry) => entry.id === info.id);
        if (sameId && sameId.workplace !== info.workplace) throw new Error('Workplace name cannot be changed');
        if (existing && existing.id !== info.id) throw new Error('Workplace already exists');
        const result = useRemoteData()
          ? WorkInfo.parse(await (existing ? api.workInfos.update(info) : api.workInfos.createOrUpdate(info)))
          : info;
        this.workInfos.set(result.workplace, result);
      });
    },

    /** Add imported details; existing metadata wins on matching profile/rate IDs. */
    async merge(workInfo: WorkInfo): Promise<void> {
      await withStatus(this, async () => {
        const incoming = WorkInfo.parse(workInfo);
        const existing = this.workInfos.get(incoming.workplace);
        if (existing) incoming.id = existing.id;
        const result = useRemoteData()
          ? WorkInfo.parse(await api.workInfos.createOrUpdate(incoming))
          : mergeDetails(existing, incoming);
        this.workInfos.set(result.workplace, result);
      });
    },

    async delete(workplace: string, payRate?: number): Promise<void> {
      await withStatus(this, async () => {
        const entry = this.workInfos.get(workplace);
        if (!entry) throw new Error(`Cannot delete: "${workplace}" not found`);
        if (useRemoteData()) await api.workInfos.delete(entry.id, payRate);
        if (payRate === undefined) {
          this.workInfos.delete(workplace);
        } else {
          const info = WorkInfo.parse(entry);
          info.profiles.forEach((profile) => {
            profile.payRates = profile.payRates.filter(
              (rate) => !(rate.hourlyRate === payRate && isLegacyRateId(rate.id) && !rate.name)
            );
          });
          this.workInfos.set(workplace, info);
        }
      });
    },

    enableAutoPersist(): void {
      this.$subscribe(
        (_mutation, state) => {
          localStorage.setItem('workInfos', JSON.stringify([...state.workInfos.values()].map((info) => info.toDTO())));
        },
        { detached: true }
      );
    }
  }
});
