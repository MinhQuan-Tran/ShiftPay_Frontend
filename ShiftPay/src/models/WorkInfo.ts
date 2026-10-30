export type PayRateOption = {
  id: string;
  name: string;
  hourlyRate: number;
};

export type WorkProfile = {
  id: string;
  position?: string;
  location?: string;
  payRates: PayRateOption[];
};

type WorkInfoProps = {
  id?: string;
  workplace: string;
  payRates?: Set<number> | number[];
  profiles?: WorkProfile[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength: number, optional = false): string {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new Error(`Invalid ${label}`);
  const result = value.trim();
  if ((!optional && !result) || result.length > maxLength) throw new Error(`Invalid ${label}`);
  return result;
}

function rateAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Pay rate must be a non-negative finite number');
  }
  return value;
}

/** Match the canonical decimal IDs emitted by the backend, without changing their identity. */
export function isLegacyRateId(id: string): boolean {
  if (!/^legacy-(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/.test(id)) return false;
  const [integer, fraction = ''] = id.slice(7).split('.');
  return fraction.length <= 28 && BigInt(integer + fraction) <= 79228162514264337593543950335n;
}

/** JavaScript switches to exponent notation for small amounts; persisted IDs use plain decimals. */
export function legacyRateId(amount: number): string {
  const value = String(rateAmount(amount));
  if (!value.includes('e')) return `legacy-${value}`;
  const [coefficient, exponent] = value.split('e');
  const [integer, fraction = ''] = coefficient.split('.');
  const digits = integer + fraction;
  const decimalPosition = integer.length + Number(exponent);
  const decimal =
    decimalPosition <= 0
      ? `0.${'0'.repeat(-decimalPosition)}${digits}`
      : decimalPosition >= digits.length
        ? digits + '0'.repeat(decimalPosition - digits.length)
        : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  return `legacy-${decimal}`;
}

function uniqueIds<T extends { id: string }>(values: T[], label: string): T[] {
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    throw new Error(`Duplicate ${label} IDs`);
  }
  return values;
}

function parseProfiles(value: unknown): WorkProfile[] {
  if (!Array.isArray(value)) throw new Error('Invalid work profiles');
  return uniqueIds(
    value.map((entry) => {
      const profile = record(entry, 'work profile');
      if (!Array.isArray(profile.payRates)) throw new Error('Invalid profile pay rates');
      return {
        id: text(profile.id, 'profile ID', 100),
        position: text(profile.position, 'position', 200, true) || undefined,
        location: text(profile.location, 'location', 200, true) || undefined,
        payRates: uniqueIds(
          profile.payRates.map((entry) => {
            const rate = record(entry, 'pay rate');
            const amount = rateAmount(rate.hourlyRate);
            const id = text(rate.id, 'pay rate ID', 100);
            return {
              id,
              name: text(rate.name, 'pay rate name', 100, isLegacyRateId(id)),
              hourlyRate: amount
            };
          }),
          'pay rate'
        )
      };
    }),
    'profile'
  );
}

function legacyProfiles(value: unknown): WorkProfile[] {
  const values = value instanceof Set ? [...value] : value;
  const rates = values === undefined ? [] : typeof values === 'number' ? [values] : values;
  if (!Array.isArray(rates)) throw new Error('Invalid pay rates');
  const amounts = [...new Set(rates.map(rateAmount))];
  return amounts.length === 0
    ? []
    : [
        {
          id: 'legacy',
          payRates: amounts.map((amount) => ({ id: legacyRateId(amount), name: '', hourlyRate: amount }))
        }
      ];
}

export default class WorkInfo {
  id: string;
  workplace: string;
  profiles: WorkProfile[];

  constructor(props: WorkInfoProps) {
    this.id = props.id ? text(props.id, 'workplace ID', 100) : crypto.randomUUID();
    this.workplace = text(props.workplace, 'workplace', 200);
    this.profiles = props.profiles === undefined ? legacyProfiles(props.payRates) : parseProfiles(props.profiles);
  }

  static parse(value: unknown): WorkInfo {
    const info = record(value, 'work info');
    return new WorkInfo({
      id: (info.id ?? info._id) as string | undefined,
      workplace: (info.workplace ?? info._workplace) as string,
      profiles: (info.profiles ?? info._profiles) as WorkProfile[] | undefined,
      payRates: (info.payRates ?? info._payRates ?? info.payRate) as number[] | undefined
    });
  }

  /** Numeric projection for older clients; profile rates remain the source of truth. */
  get payRates(): Set<number> {
    return new Set(this.profiles.flatMap((profile) => profile.payRates.map((rate) => rate.hourlyRate)));
  }

  toDTO(): { id: string; workplace: string; payRates: number[]; profiles: WorkProfile[] } {
    return {
      id: this.id,
      workplace: this.workplace,
      payRates: [...this.payRates],
      profiles: this.profiles.map((profile) => ({
        ...profile,
        payRates: profile.payRates.map((rate) => ({ ...rate }))
      }))
    };
  }
}
