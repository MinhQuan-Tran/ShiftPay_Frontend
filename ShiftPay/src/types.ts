export type WorkInfo = {
  payRates: Set<number>;
};

export type Day = {
  dayStartTime: Date;
  dayEndTime: Date;
  prevMonth: boolean; // Is this the day from the previous month?
  nextMonth: boolean; // Is this the day from the next month?
};

export const STATUS = { Ready: 'Ready', Loading: 'Loading', Error: 'Error' } as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];
