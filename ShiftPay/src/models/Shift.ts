import Duration from '@/models/Duration';

export type ShiftWorkDetails = {
  workProfileId?: string;
  payRateId?: string;
  position?: string;
  location?: string;
  payRateName?: string;
};

export type ShiftParams = ShiftWorkDetails & {
  id?: string;
  workplace: string;
  payRate: number;
  startTime: Date;
  endTime: Date;
  unpaidBreaks?: Duration[];
};

export default class Shift {
  private _id: string = '';
  private _workplace: string = '';
  private _payRate: number = 0;
  private _workProfileId?: string;
  private _payRateId?: string;
  private _position?: string;
  private _location?: string;
  private _payRateName?: string;
  private _startTime: Date = new Date();
  private _endTime: Date = new Date();
  private _unpaidBreaks?: Duration[];

  // Short, tidy constructor. `id` first, auto-generated if omitted.
  constructor({ id = crypto.randomUUID(), ...rest }: ShiftParams) {
    // Use setters via Object.assign so validation still runs (and deep copy happens for unpaidBreaks).
    Object.assign(this, { id, ...rest });
  }

  static parse(data: unknown): Shift {
    if (!data) throw new Error('Shift data is undefined');

    // Pull values from either plain or underscored shapes
    const id = (data as { id?: string }).id ?? (data as { _id?: string })._id;
    const workplace = (data as { workplace?: string }).workplace ?? (data as { _workplace?: string })._workplace;
    const payRate = (data as { payRate?: number }).payRate ?? (data as { _payRate?: number })._payRate;
    const startRaw =
      (data as { startTime?: Date }).startTime ??
      (data as { _startTime?: Date })._startTime ??
      (data as { from?: Date }).from ??
      (data as { _from?: Date })._from;
    const endRaw =
      (data as { endTime?: Date }).endTime ??
      (data as { _endTime?: Date })._endTime ??
      (data as { to?: Date }).to ??
      (data as { _to?: Date })._to;

    // Basic validation (don’t reject 0 payRate)
    if (id == null || workplace == null || startRaw == null || endRaw == null || payRate == null) {
      console.error('Missing required shift fields in data:', {
        id,
        workplace,
        payRate,
        startRaw,
        endRaw,
        original: data
      });
      throw new Error('Missing required shift fields');
    }

    const startTime = new Date(startRaw);
    const endTime = new Date(endRaw);

    const details: ShiftWorkDetails = {};
    const record = data as Record<string, unknown>;
    for (const key of ['workProfileId', 'payRateId', 'position', 'location', 'payRateName'] as const) {
      const value = record[key] ?? record[`_${key}`];
      if (value != null && typeof value !== 'string') {
        throw new Error(`${key} must be a string`);
      }
      details[key] = typeof value === 'string' ? value : undefined;
    }

    // Build unpaid breaks array as Duration[]
    const rawBreaks = Array.isArray((data as { unpaidBreaks?: Duration[] }).unpaidBreaks)
      ? (data as { unpaidBreaks?: Duration[] }).unpaidBreaks
      : Array.isArray((data as { _unpaidBreaks?: Duration[] })._unpaidBreaks)
        ? (data as { _unpaidBreaks?: Duration[] })._unpaidBreaks
        : [];

    const unpaidBreaks = (rawBreaks ?? [])
      .map((ub: unknown) => {
        if (ub instanceof Duration) {
          return ub;
        }

        return new Duration(ub as ConstructorParameters<typeof Duration>[0]);
      })
      .filter((ub: Duration) => ub.hours + ub.minutes > 0);

    return new Shift({
      id,
      workplace,
      payRate: Number(payRate),
      ...details,
      startTime,
      endTime,
      unpaidBreaks: unpaidBreaks.length > 0 ? unpaidBreaks : undefined
    });
  }

  static parseAll(data: unknown[]): {
    shifts: Shift[];
    success: boolean;
  } {
    let shifts = new Array<Shift>();
    let success = true;

    try {
      shifts = data
        .map((rawShift: unknown) => {
          try {
            return this.parse(rawShift);
          } catch (error) {
            console.error('Failed to parse shift from source:', rawShift, error);
            success = false;
            return null;
          }
        })
        .filter((shift: Shift | null): shift is Shift => {
          return shift !== null;
        });
    } catch (error) {
      console.error('Error parsing multiple shifts:', error);
      success = false;
    }

    return {
      shifts,
      success
    };
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get workplace(): string {
    return this._workplace;
  }
  get payRate(): number {
    return this._payRate;
  }
  get workProfileId(): string | undefined {
    return this._workProfileId;
  }
  get payRateId(): string | undefined {
    return this._payRateId;
  }
  get position(): string | undefined {
    return this._position;
  }
  get location(): string | undefined {
    return this._location;
  }
  get payRateName(): string | undefined {
    return this._payRateName;
  }
  get startTime(): Date {
    return this._startTime;
  }
  get endTime(): Date {
    return this._endTime;
  }
  get unpaidBreaks(): Duration[] | undefined {
    return this._unpaidBreaks;
  }

  // Including unpaid breaks
  get duration(): Duration {
    const ms = this.endTime.getTime() - this.startTime.getTime();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return new Duration({ hours, minutes });
  }

  get totalBreakDuration(): Duration {
    return (
      this.unpaidBreaks?.reduce(
        (acc, b) => {
          acc.hours += b.hours;
          acc.minutes += b.minutes;
          return acc;
        },
        new Duration({ hours: 0, minutes: 0 })
      ) ?? new Duration({ hours: 0, minutes: 0 })
    );
  }

  get billableDuration(): Duration {
    const workedMin = this.duration.hours * 60 + this.duration.minutes;
    const breakMin = this.totalBreakDuration.hours * 60 + this.totalBreakDuration.minutes;
    const billable = workedMin - breakMin;
    return new Duration({ minutes: billable });
  }

  get income(): number {
    const billable = this.billableDuration;
    return this.payRate * (billable.hours + billable.minutes / 60);
  }

  // Setters (validation kept)
  set id(id: string | number) {
    if (typeof id !== 'number' && (typeof id !== 'string' || id.trim() === '')) {
      throw new Error('ID must be a non-empty string or number');
    }

    id = id.toString().trim();

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error('ID can only contain alphanumeric characters, underscores, and hyphens');
    }
    this._id = id;
  }

  set workplace(workplace: string) {
    this._workplace = workplace;
  }

  set payRate(payRate: number) {
    const n = Number(payRate);
    if (Number.isNaN(n)) throw new Error('Pay rate should be a number');
    if (n < 0) throw new Error('Pay rate cannot be negative');
    this._payRate = n;
  }

  set workProfileId(value: string | undefined) {
    this._workProfileId = value?.trim() || undefined;
  }
  set payRateId(value: string | undefined) {
    this._payRateId = value?.trim() || undefined;
  }
  set position(value: string | undefined) {
    this._position = value?.trim() || undefined;
  }
  set location(value: string | undefined) {
    this._location = value?.trim() || undefined;
  }
  set payRateName(value: string | undefined) {
    this._payRateName = value?.trim() || undefined;
  }

  set startTime(startTime: Date) {
    const d = new Date(startTime);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
    this._startTime = d;
  }

  set endTime(endTime: Date) {
    const d = new Date(endTime);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
    if (this.startTime > d) throw new Error('End date cannot be before the start date');
    this._endTime = d;
  }

  set unpaidBreaks(unpaidBreaks: Duration[] | undefined) {
    if (unpaidBreaks === undefined) {
      this._unpaidBreaks = undefined;
      return;
    }

    this._unpaidBreaks = unpaidBreaks.map(
      (duration) => new Duration({ hours: duration.hours, minutes: duration.minutes })
    );
  }

  limitedDuration(fromLimit?: Date, toLimit?: Date): Duration {
    const fromDate = fromLimit && this.startTime < fromLimit ? new Date(fromLimit) : new Date(this.startTime);
    const toDate = toLimit && this.endTime > toLimit ? new Date(toLimit) : new Date(this.endTime);

    const ms = Math.max(0, toDate.getTime() - fromDate.getTime());
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return new Duration({ hours, minutes });
  }

  toDTO(): ShiftWorkDetails & {
    workplace: string;
    payRate: number;
    startTime: string;
    endTime: string;
    unpaidBreaks: string[];
  } {
    return {
      workplace: this.workplace,
      payRate: this.payRate,
      workProfileId: this.workProfileId,
      payRateId: this.payRateId,
      position: this.position,
      location: this.location,
      payRateName: this.payRateName,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      unpaidBreaks: this.unpaidBreaks?.map((b) => b.toDTO()) ?? []
    };
  }
}
