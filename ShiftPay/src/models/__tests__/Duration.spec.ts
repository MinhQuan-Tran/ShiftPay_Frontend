import { describe, it, expect } from 'vitest';
import Duration from '@/models/Duration';

describe('Duration', () => {
  describe('constructor', () => {
    it('defaults to 0:0 with no args', () => {
      const d = new Duration();
      expect(d.hours).toBe(0);
      expect(d.minutes).toBe(0);
    });

    it('creates from hours and minutes', () => {
      const d = new Duration({ hours: 2, minutes: 30 });
      expect(d.hours).toBe(2);
      expect(d.minutes).toBe(30);
    });

    it('creates from underscored fields (_hours, _minutes)', () => {
      const d = new Duration({ _hours: 4, _minutes: 10 });
      expect(d.hours).toBe(4);
      expect(d.minutes).toBe(10);
    });

    it('prefers public fields over underscored when both present', () => {
      const d = new Duration({ _hours: 1, hours: 5, _minutes: 0, minutes: 20 });
      expect(d.hours).toBe(5);
      expect(d.minutes).toBe(20);
    });

    it('creates from "H:M" string', () => {
      const d = new Duration('1:45');
      expect(d.hours).toBe(1);
      expect(d.minutes).toBe(45);
    });

    it('creates from string with whitespace', () => {
      const d = new Duration(' 2 : 15 ');
      expect(d.hours).toBe(2);
      expect(d.minutes).toBe(15);
    });

    it('creates from startTime and endTime (time range)', () => {
      const start = new Date('2025-01-01T09:00:00');
      const end = new Date('2025-01-01T11:30:00');
      const d = new Duration({ startTime: start, endTime: end });
      expect(d.hours).toBe(2);
      expect(d.minutes).toBe(30);
    });

    it('handles time range crossing midnight', () => {
      const start = new Date('2025-01-01T23:00:00');
      const end = new Date('2025-01-02T01:15:00');
      const d = new Duration({ startTime: start, endTime: end });
      expect(d.hours).toBe(2);
      expect(d.minutes).toBe(15);
    });
  });

  describe('minute normalization', () => {
    it('normalizes minutes >= 60 into hours', () => {
      const d = new Duration({ hours: 0, minutes: 90 });
      expect(d.hours).toBe(1);
      expect(d.minutes).toBe(30);
    });

    it('normalizes large minute values', () => {
      const d = new Duration({ hours: 0, minutes: 150 });
      expect(d.hours).toBe(2);
      expect(d.minutes).toBe(30);
    });

    it('normalizes exactly 60 minutes', () => {
      const d = new Duration({ hours: 1, minutes: 60 });
      expect(d.hours).toBe(2);
      expect(d.minutes).toBe(0);
    });
  });

  describe('validation', () => {
    it('throws on negative hours', () => {
      expect(() => new Duration({ hours: -1, minutes: 0 })).toThrow('Hours cannot be negative');
    });

    it('throws on negative minutes', () => {
      expect(() => new Duration({ hours: 0, minutes: -5 })).toThrow('Minutes cannot be negative');
    });

    it('throws on non-integer hours', () => {
      expect(() => new Duration({ hours: 1.5, minutes: 0 })).toThrow('Hours should be an integer');
    });

    it('throws on non-integer minutes', () => {
      expect(() => new Duration({ hours: 0, minutes: 1.5 })).toThrow('Minutes should be an integer');
    });

    it('throws on invalid string format', () => {
      expect(() => new Duration('abc:def')).toThrow('Invalid duration string format');
    });
  });

  describe('totalMinutes', () => {
    it('calculates hours*60 + minutes', () => {
      const d = new Duration({ hours: 2, minutes: 30 });
      expect(d.totalMinutes).toBe(150);
    });

    it('reflects normalized minutes', () => {
      const d = new Duration({ hours: 1, minutes: 90 });
      expect(d.totalMinutes).toBe(150);
    });

    it('is 0 for empty duration', () => {
      expect(new Duration().totalMinutes).toBe(0);
    });
  });

  describe('static add', () => {
    it('adds two durations without overflow', () => {
      const result = Duration.add(new Duration({ hours: 1, minutes: 20 }), new Duration({ hours: 2, minutes: 10 }));
      expect(result.hours).toBe(3);
      expect(result.minutes).toBe(30);
    });

    it('adds two durations with minute overflow', () => {
      const result = Duration.add(new Duration({ hours: 1, minutes: 30 }), new Duration({ hours: 0, minutes: 45 }));
      expect(result.hours).toBe(2);
      expect(result.minutes).toBe(15);
    });
  });

  describe('instance add', () => {
    it('mutates the instance and returns new duration', () => {
      const a = new Duration({ hours: 1, minutes: 30 });
      const b = new Duration({ hours: 0, minutes: 45 });
      const result = a.add(b);

      // Returns the sum
      expect(result.hours).toBe(2);
      expect(result.minutes).toBe(15);

      // Also mutates `a`
      expect(a.hours).toBe(2);
      expect(a.minutes).toBe(15);
    });
  });

  describe('toDTO', () => {
    it('returns "H:M" string', () => {
      expect(new Duration({ hours: 3, minutes: 15 }).toDTO()).toBe('3:15');
    });

    it('returns "0:0" for empty duration', () => {
      expect(new Duration().toDTO()).toBe('0:0');
    });

    it('returns "0:5" (no zero-padding)', () => {
      expect(new Duration({ hours: 0, minutes: 5 }).toDTO()).toBe('0:5');
    });
  });
});
