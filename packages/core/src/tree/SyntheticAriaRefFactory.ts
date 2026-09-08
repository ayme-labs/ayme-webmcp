import { AriaRefSchema, type AriaRef } from "./StructuralTypes";

export type SyntheticAriaRefAllocator = {
  create(): AriaRef;
};

/** Allocates reserved `s_*` refs for structural evidence without a browser ref. */
export class SyntheticAriaRefFactory {
  private _counter = 0;

  create(): AriaRef {
    this._counter += 1;
    return AriaRefSchema.parse(`s_${this._counter}`);
  }

  reset(): void {
    this._counter = 0;
  }
}
