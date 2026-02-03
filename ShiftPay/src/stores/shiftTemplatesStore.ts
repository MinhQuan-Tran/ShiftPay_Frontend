import { defineStore } from 'pinia';
import { api } from '@/api';
import { useAuthStore } from './authStore';
import Shift from '@/models/Shift';
import { STATUS, type Status, type ShiftTemplate } from '@/types';
import { withStatus } from '@/utils';

export const useShiftTemplatesStore = defineStore('shiftTemplates', {
  state: () => ({
    templates: new Map<string, ShiftTemplate>(),
    status: STATUS.Ready as Status
  }),

  actions: {
    async fetch() {
      await withStatus(this, async () => {
        let parsedData = JSON.parse(localStorage.getItem('shiftTemplates') || '[]');

        const authStore = useAuthStore();

        if (authStore.isAuthenticated) {
          parsedData = await api.shiftTemplates.fetch();
        }

        console.log('Fetched shift templates:', parsedData);

        // Parse & Validate - store both id and shift data
        this.templates = new Map<string, ShiftTemplate>(
          parsedData.map((template: any) => [
            template.templateName,
            {
              id: template.id,
              templateName: template.templateName,
              shift: Shift.parse(template)
            }
          ])
        );
      });
    },

    /**
     * Add or update a shift template (upsert by templateName).
     * If a template with the same name exists, it will be updated.
     */
    async add(name: string, template: Shift) {
      await withStatus(this, async () => {
        console.log('Adding/updating shift template:', name, template);

        try {
          template = Shift.parse(template);
        } catch (error: any) {
          throw new Error('Invalid shift template input: ' + (error && error.message ? error.message : String(error)));
        }

        const auth = useAuthStore();

        if (auth.isAuthenticated) {
          const data = await api.shiftTemplates.createOrUpdate(name, template);
          console.log('Shift template created/updated on server:', data);

          this.templates.set(data.templateName, {
            id: data.id,
            templateName: data.templateName,
            shift: Shift.parse(data)
          });
          return;
        }

        // Local-only: generate ID if not authenticated
        const existingTemplate = this.templates.get(name);
        this.templates.set(name, {
          id: existingTemplate?.id ?? crypto.randomUUID(),
          templateName: name,
          shift: template
        });
      });
    },

    /**
     * Delete a shift template by templateName.
     * Uses the stored ID for the API call.
     */
    async delete(name: string) {
      await withStatus(this, async () => {
        const auth = useAuthStore();
        const templateEntry = this.templates.get(name);

        if (auth.isAuthenticated) {
          if (!templateEntry?.id) {
            throw new Error(`Cannot delete template "${name}": ID not found`);
          }
          await api.shiftTemplates.delete(templateEntry.id);
        }

        this.templates.delete(name);
      });
    },

    /**
     * Persist to localStorage on ANY state change (detached subscription).
     * Mirrors shiftStore's auto-persist pattern.
     * Serializes as array of ShiftTemplateDTO-like objects for consistency with API format.
     */
    enableAutoPersist(): void {
      this.$subscribe(
        function (_mutation, state) {
          const serialized = Array.from(state.templates.values()).map((entry) => ({
            id: entry.id,
            templateName: entry.templateName,
            ...entry.shift.toDTO()
          }));
          localStorage.setItem('shiftTemplates', JSON.stringify(serialized));
        },
        { detached: true }
      );
    }
  }
});
