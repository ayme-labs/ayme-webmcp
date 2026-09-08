import { VisitIdSchema } from "./Visit";

/**
 * Factory for creating human-readable visit IDs (`visit_1`, `visit_2`, …).
 * Reset at the start of each Structural Observation Session.
 */
export class VisitIdFactory {
  private _next = 1;

  create() {
    return VisitIdSchema.parse(`visit_${this._next++}`);
  }

  reset(): void {
    this._next = 1;
  }
}
