import { AriaRefSchema, type AriaRef } from "./StructuralTypes";
import { CounterIdFactory } from "./CounterIdFactory";

export type SyntheticAriaRefAllocator = {
  create(): AriaRef;
};

/** Allocates reserved `s_*` refs for structural evidence without a browser ref. */
export class SyntheticAriaRefFactory extends CounterIdFactory<
  typeof AriaRefSchema
> {
  protected get prefix(): string {
    return "s";
  }

  protected get schema(): typeof AriaRefSchema {
    return AriaRefSchema;
  }
}
