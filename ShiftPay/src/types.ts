import type Shift from './models/Shift';

export type WorkInfo = {
  id: string;
  workplace: string;
  payRates: Set<number>;
};

export interface ShiftTemplate {
  id: string;
  templateName: string;
  shift: Shift;
}

export interface ImportParsedData {
  shifts: Shift[];
  shiftErrors: string[];
  templates: Map<string, Shift>;
  templateErrors: string[];
  workInfos: Map<string, WorkInfo>;
  workInfoErrors: string[];
  checkInTime: Date | null;
  checkInTimeError: string | null;
}

export type Day = {
  dayStartTime: Date;
  dayEndTime: Date;
  prevMonth: boolean; // Is this the day from the previous month?
  nextMonth: boolean; // Is this the day from the next month?
};

export type DateRange = {
  start: Date;
  end: Date;
};

export const STATUS = { Ready: 'Ready', Loading: 'Loading', Error: 'Error' } as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}
