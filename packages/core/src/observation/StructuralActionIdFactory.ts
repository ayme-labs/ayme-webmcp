import { StructuralActionIdSchema } from "./StructuralAction";

/** Creates stable identifiers for structural actions. */
export class StructuralActionIdFactory {
  private _next = 1;

  create() {
    return StructuralActionIdSchema.parse(`interaction_${this._next++}`);
  }

  reset(): void {
    this._next = 1;
  }
}
