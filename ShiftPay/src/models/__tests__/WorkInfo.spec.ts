import { describe, expect, it } from 'vitest';
import WorkInfo, { isLegacyRateId, legacyRateId } from '@/models/WorkInfo';

const profile = {
  id: 'b15ba783-78a0-4d72-9946-b95821c65361',
  position: ' Nurse ',
  location: ' Ward A ',
  payRates: [
    { id: '90ed6576-624f-4c14-8648-4d71b359c7a6', name: ' Weekend ', hourlyRate: 30 },
    { id: '4c9a2f60-2fa4-4782-bc83-51bb9781dba2', name: 'Holiday', hourlyRate: 30 }
  ]
};

function details() {
  return WorkInfo.parse({ id: 'work-1', workplace: ' Hospital ', profiles: [profile] });
}

describe('WorkInfo', () => {
  it('migrates old numeric rates without inventing names or losing zero rates', () => {
    const info = WorkInfo.parse({ workplace: 'Cafe', payRates: [0, 22.5, 22.5] });
    expect(info.profiles).toEqual([
      {
        id: 'legacy',
        payRates: [
          { id: 'legacy-0', name: '', hourlyRate: 0 },
          { id: 'legacy-22.5', name: '', hourlyRate: 22.5 }
        ]
      }
    ]);
    expect(info.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('supports singular and underscored legacy fields and old Set constructors', () => {
    expect(WorkInfo.parse({ workplace: 'Cafe', payRate: 25 }).payRates).toEqual(new Set([25]));
    expect(WorkInfo.parse({ _id: 'old', _workplace: 'Cafe', _payRates: [20] }).id).toBe('old');
    expect(new WorkInfo({ id: 'old', workplace: 'Cafe', payRates: new Set([20]) }).payRates).toEqual(new Set([20]));
  });

  it('keeps distinct named rates with equal amounts and trims metadata', () => {
    const info = details();
    expect(info.workplace).toBe('Hospital');
    expect(info.profiles[0].position).toBe('Nurse');
    expect(info.profiles[0].location).toBe('Ward A');
    expect(info.profiles[0].payRates.map((rate) => rate.name)).toEqual(['Weekend', 'Holiday']);
    expect(info.payRates).toEqual(new Set([30]));
  });

  it('round trips profiles and serializes a separate legacy numeric projection', () => {
    const info = details();
    const dto = info.toDTO();
    expect(dto.payRates).toEqual([30]);
    expect(WorkInfo.parse(JSON.parse(JSON.stringify(dto))).toDTO()).toEqual(dto);
    dto.profiles[0].payRates[0].name = 'Changed';
    expect(info.profiles[0].payRates[0].name).toBe('Weekend');
  });

  it('treats supplied profiles as authoritative over the numeric projection', () => {
    const info = WorkInfo.parse({ workplace: 'Cafe', payRates: [50], profiles: [] });
    expect(info.payRates.size).toBe(0);
    expect(info.profiles).toEqual([]);
  });

  it('preserves positions/locations when a profile has no rates', () => {
    const info = WorkInfo.parse({
      workplace: 'Hospital',
      profiles: [{ id: profile.id, position: 'Nurse', location: 'Ward A', payRates: [] }]
    });
    expect(info.toDTO().profiles[0]).toMatchObject({ position: 'Nurse', location: 'Ward A', payRates: [] });
  });

  it('accepts null optional metadata from the API', () => {
    const info = WorkInfo.parse({
      workplace: 'Cafe',
      profiles: [{ id: profile.id, position: null, location: null, payRates: [] }]
    });
    expect(info.profiles[0].position).toBeUndefined();
    expect(info.profiles[0].location).toBeUndefined();
  });

  it('allows unnamed remembered rates within a selected profile', () => {
    const info = WorkInfo.parse({
      workplace: 'Cafe',
      profiles: [{ id: profile.id, payRates: [{ id: 'legacy-25', name: '', hourlyRate: 25 }] }]
    });
    expect(info.profiles[0].payRates[0].name).toBe('');
  });

  it('keeps a migrated rate identity when editing its amount without adding a name', () => {
    const info = WorkInfo.parse({
      workplace: 'Cafe',
      profiles: [{ id: 'legacy', payRates: [{ id: 'legacy-25', name: '', hourlyRate: 28 }] }]
    });
    expect(info.profiles[0].payRates[0]).toEqual({ id: 'legacy-25', name: '', hourlyRate: 28 });
  });

  it('uses backend decimal spelling for exponent-form amounts and round trips their IDs', () => {
    expect(legacyRateId(1e-7)).toBe('legacy-0.0000001');
    expect(legacyRateId(1.2e-7)).toBe('legacy-0.00000012');
    expect(legacyRateId(1e21)).toBe('legacy-1000000000000000000000');
    const info = WorkInfo.parse({ workplace: 'Cafe', payRates: [1e-7] });
    expect(info.profiles[0].payRates[0].id).toBe('legacy-0.0000001');
    expect(WorkInfo.parse(info.toDTO()).toDTO()).toEqual(info.toDTO());
  });

  it('recognizes only canonical reserved decimal IDs accepted by the backend', () => {
    for (const id of ['legacy-0', 'legacy-0.0000001', 'legacy-25', 'legacy-25.5']) {
      expect(isLegacyRateId(id)).toBe(true);
    }
    for (const id of [
      'legacy-1e-7',
      'legacy-25.0',
      'legacy-025',
      'legacy--1',
      'legacy-1.00000000000000000000000000001',
      'legacy-79228162514264337593543950336'
    ]) {
      expect(isLegacyRateId(id)).toBe(false);
    }
  });

  it('requires names for new manually authored rates', () => {
    expect(() =>
      WorkInfo.parse({
        workplace: 'Cafe',
        profiles: [{ id: profile.id, payRates: [{ id: profile.payRates[0].id, name: ' ', hourlyRate: 25 }] }]
      })
    ).toThrow('pay rate name');
  });

  it.each([-1, NaN, Infinity, '25', null])('rejects invalid legacy rate %s', (amount) => {
    expect(() => WorkInfo.parse({ workplace: 'Cafe', payRates: [amount] })).toThrow();
  });

  it.each([-1, NaN, Infinity, '25', null])('rejects invalid named rate %s', (amount) => {
    expect(() =>
      WorkInfo.parse({
        workplace: 'Cafe',
        profiles: [{ ...profile, payRates: [{ ...profile.payRates[0], hourlyRate: amount }] }]
      })
    ).toThrow();
  });

  it('rejects duplicate IDs instead of silently discarding profiles or named rates', () => {
    expect(() => WorkInfo.parse({ workplace: 'Cafe', profiles: [profile, profile] })).toThrow('Duplicate profile IDs');
    expect(() =>
      WorkInfo.parse({
        workplace: 'Cafe',
        profiles: [{ ...profile, payRates: [profile.payRates[0], profile.payRates[0]] }]
      })
    ).toThrow('Duplicate pay rate IDs');
  });

  it('rejects malformed entries and excessive metadata', () => {
    expect(() => WorkInfo.parse(null)).toThrow();
    expect(() => WorkInfo.parse({ workplace: '  ' })).toThrow('workplace');
    expect(() => WorkInfo.parse({ workplace: 'Cafe', profiles: {} })).toThrow('profiles');
    expect(() => WorkInfo.parse({ workplace: 'Cafe', profiles: [{ ...profile, location: 'A'.repeat(201) }] })).toThrow(
      'location'
    );
    expect(() =>
      WorkInfo.parse({
        workplace: 'Cafe',
        profiles: [{ ...profile, payRates: [{ ...profile.payRates[0], name: 'A'.repeat(101) }] }]
      })
    ).toThrow('pay rate name');
  });
});
