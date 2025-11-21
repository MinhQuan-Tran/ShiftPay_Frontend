import Duration from '@/models/Duration';

export type WorkInfo = {
  payRates: Set<number>;
};

export type Day = {
  dayStartTime: Date;
  dayEndTime: Date;
  prevMonth: boolean; // Is this the day from the previous month?
  nextMonth: boolean; // Is this the day from the next month?
};

// export type Week = {
//   days: Day[];
//   stats: {
//     income: {
//       beforeTax: number;
//       afterTax: number;
//     };
//     time: {
//       totalHours: Duration;
//       totalBillableHours: Duration;
//     };
//   };
// };

// export const WeekStatisticCategory = {
