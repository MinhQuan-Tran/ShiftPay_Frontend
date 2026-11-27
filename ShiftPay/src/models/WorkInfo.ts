export default class WorkInfo {
  private _id: string;
  private _workplace: string;
  private _payRates: Set<number>;

  constructor(props: { id: string; workplace: string; payRates: Set<number> }) {
    this._id = props.id;
    this._workplace = props.workplace;
    this._payRates = props.payRates;
  }

  get id(): string {
    return this._id;
  }

  get workplace(): string {
    return this._workplace;
  }

  get payRates(): Set<number> {
    return this._payRates;
  }

  set id(value: string) {
    this._id = value;
  }

  set workplace(value: string) {
    this._workplace = value;
  }

  set payRates(value: Set<number>) {
    this._payRates = value;
  }

  toDTO(): { id: string; workplace: string; payRates: number[] } {
    return {
      id: this._id,
      workplace: this._workplace,
      payRates: Array.from(this._payRates)
    };
  }
}
