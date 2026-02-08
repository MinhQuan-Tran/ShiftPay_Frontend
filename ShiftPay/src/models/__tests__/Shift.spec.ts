import { describe, it, expect } from 'vitest';
import Shift from '@/models/Shift';
import Duration from '@/models/Duration';

const BASE = {
  id: 'test-1',
  workplace: 'Cafe',
  payRate: 25,
  startTime: new Date('2025-06-01T09:00:00'),
  endTime: new Date('2025-06-01T17:00:00')
};

function makeShift(overrides?: Partial<typeof BASE & { unpaidBreaks: Duration[] }>) {
  return new Shift({ ...BASE, ...overrides });
}

describe('Shift', () => {
  describe('constructor', () => {
    it('creates with required fields', () => {
      const s = makeShift();
      expect(s.id).toBe('test-1');
      expect(s.workplace).toBe('Cafe');
      expect(s.payRate).toBe(25);
    });

    it('auto-generates UUID when id omitted', () => {
      const s = new Shift({ workplace: 'X', payRate: 20, startTime: new Date(), endTime: new Date() });
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('accepts unpaid breaks', () => {
      const s = makeShift({ unpaidBreaks: [new Duration({ hours: 0, minutes: 30 })] });
      expect(s.unpaidBreaks).toHaveLength(1);
      expect(s.unpaidBreaks![0].minutes).toBe(30);
    });
  });

  describe('parse', () => {
    it('parses camelCase fields', () => {
      const s = Shift.parse({
        id: 'abc',
        workplace: 'Shop',
        payRate: 30,
        startTime: '2025-06-01T09:00:00Z',
        endTime: '2025-06-01T17:00:00Z'
      });
      expect(s.workplace).toBe('Shop');
      expect(s.payRate).toBe(30);
    });

    it('parses underscored private fields', () => {
      const s = Shift.parse({
        _id: 'abc',
        _workplace: 'Shop',
        _payRate: 30,
        _startTime: '2025-06-01T09:00:00Z',
        _endTime: '2025-06-01T17:00:00Z'
      });
      expect(s.id).toBe('abc');
      expect(s.workplace).toBe('Shop');
    });

    it('parses from/to aliases for time fields', () => {
      const s = Shift.parse({
        id: 'abc',
        workplace: 'Shop',
        payRate: 30,
        from: '2025-06-01T09:00:00Z',
        to: '2025-06-01T17:00:00Z'
      });
      expect(s.startTime).toBeInstanceOf(Date);
      expect(s.endTime).toBeInstanceOf(Date);
    });

    it('parses unpaid breaks from "H:M" strings', () => {
      const s = Shift.parse({
        id: 'abc',
        workplace: 'Shop',
        payRate: 30,
        startTime: '2025-06-01T09:00:00Z',
        endTime: '2025-06-01T17:00:00Z',
        unpaidBreaks: ['0:30', '0:15']
      });
      expect(s.unpaidBreaks).toHaveLength(2);
      expect(s.unpaidBreaks![0].minutes).toBe(30);
      expect(s.unpaidBreaks![1].minutes).toBe(15);
    });

    it('filters out zero-duration breaks', () => {
      const s = Shift.parse({
        id: 'abc',
        workplace: 'Shop',
        payRate: 30,
        startTime: '2025-06-01T09:00:00Z',
        endTime: '2025-06-01T17:00:00Z',
        unpaidBreaks: ['0:0', '0:30']
      });
      expect(s.unpaidBreaks).toHaveLength(1);
    });

    it('throws on undefined data', () => {
      expect(() => Shift.parse(undefined)).toThrow('Shift data is undefined');
    });

    it('throws on missing required fields', () => {
      expect(() => Shift.parse({ id: 'x' })).toThrow('Missing required shift fields');
    });

    it('accepts payRate of 0 (volunteer shifts)', () => {
      const s = Shift.parse({
        id: 'vol-1',
        workplace: 'Charity',
        payRate: 0,
        startTime: '2025-06-01T09:00:00Z',
        endTime: '2025-06-01T12:00:00Z'
      });
      expect(s.payRate).toBe(0);
    });
  });

  describe('parseAll', () => {
    it('parses valid array and returns success', () => {
      const result = Shift.parseAll([
        { id: 'a', workplace: 'X', payRate: 10, startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-01T08:00:00Z' },
        { id: 'b', workplace: 'Y', payRate: 20, startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-01T08:00:00Z' }
      ]);
      expect(result.shifts).toHaveLength(2);
      expect(result.success).toBe(true);
    });

    it('skips invalid entries and sets success=false', () => {
      const result = Shift.parseAll([
        { id: 'a', workplace: 'X', payRate: 10, startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-01T08:00:00Z' },
        { bad: 'data' }
      ]);
      expect(result.shifts).toHaveLength(1);
      expect(result.success).toBe(false);
    });
  });

  describe('computed getters', () => {
    it('calculates duration (8h shift)', () => {
      const s = makeShift();
      expect(s.duration.hours).toBe(8);
      expect(s.duration.minutes).toBe(0);
    });

    it('calculates billable duration minus breaks', () => {
      const s = makeShift({ unpaidBreaks: [new Duration({ hours: 0, minutes: 30 })] });
      expect(s.billableDuration.hours).toBe(7);
      expect(s.billableDuration.minutes).toBe(30);
    });

    it('calculates total break duration', () => {
      const s = makeShift({
        unpaidBreaks: [new Duration({ hours: 0, minutes: 30 }), new Duration({ hours: 0, minutes: 15 })]
      });
      expect(s.totalBreakDuration.hours).toBe(0);
      expect(s.totalBreakDuration.minutes).toBe(45);
    });

    it('returns 0:0 break duration when no breaks', () => {
      const s = makeShift();
      expect(s.totalBreakDuration.hours).toBe(0);
      expect(s.totalBreakDuration.minutes).toBe(0);
    });

    it('calculates income = payRate * billable hours', () => {
      // 8h shift, no breaks, $25/hr = $200
      const s = makeShift();
      expect(s.income).toBe(200);
    });

    it('calculates income with breaks deducted', () => {
      // 8h shift, 30min break, $25/hr = 7.5h * $25 = $187.50
      const s = makeShift({ unpaidBreaks: [new Duration({ hours: 0, minutes: 30 })] });
      expect(s.income).toBe(187.5);
    });
  });

  describe('validation (setters)', () => {
    it('throws on negative payRate', () => {
      expect(() => makeShift({ payRate: -1 })).toThrow('Pay rate cannot be negative');
    });

    it('throws on NaN payRate', () => {
      expect(() => makeShift({ payRate: NaN })).toThrow('Pay rate should be a number');
    });

    it('throws when endTime is before startTime', () => {
      expect(() =>
        makeShift({
          startTime: new Date('2025-06-01T17:00:00'),
          endTime: new Date('2025-06-01T09:00:00')
        })
      ).toThrow('End date cannot be before the start date');
    });

    it('throws on empty string id', () => {
      expect(() => makeShift({ id: '' })).toThrow('ID must be a non-empty string');
    });

    it('throws on id with special characters', () => {
      expect(() => makeShift({ id: 'bad id!' })).toThrow('ID can only contain alphanumeric');
    });
  });

  describe('toDTO', () => {
    it('returns correct shape with ISO strings', () => {
      const s = makeShift({ unpaidBreaks: [new Duration({ hours: 0, minutes: 30 })] });
      const dto = s.toDTO();

      expect(dto.workplace).toBe('Cafe');
      expect(dto.payRate).toBe(25);
      expect(dto.startTime).toBe(BASE.startTime.toISOString());
      expect(dto.endTime).toBe(BASE.endTime.toISOString());
      expect(dto.unpaidBreaks).toEqual(['0:30']);
    });

    it('returns empty array for unpaidBreaks when none', () => {
      const dto = makeShift().toDTO();
      expect(dto.unpaidBreaks).toEqual([]);
    });

    it('does not include id in DTO', () => {
      const dto = makeShift().toDTO();
      expect(dto).not.toHaveProperty('id');
    });
  });

  describe('limitedDuration', () => {
    it('returns full duration when no limits', () => {
      const s = makeShift();
      const d = s.limitedDuration();
      expect(d.hours).toBe(8);
      expect(d.minutes).toBe(0);
    });

    it('clips to fromLimit when shift starts earlier', () => {
      const s = makeShift();
      const d = s.limitedDuration(new Date('2025-06-01T12:00:00'));
      expect(d.hours).toBe(5);
      expect(d.minutes).toBe(0);
    });

    it('clips to toLimit when shift ends later', () => {
      const s = makeShift();
      const d = s.limitedDuration(undefined, new Date('2025-06-01T13:00:00'));
      expect(d.hours).toBe(4);
      expect(d.minutes).toBe(0);
    });

    it('clips both limits', () => {
      const s = makeShift();
      const d = s.limitedDuration(new Date('2025-06-01T10:00:00'), new Date('2025-06-01T14:00:00'));
      expect(d.hours).toBe(4);
      expect(d.minutes).toBe(0);
    });
  });
});
