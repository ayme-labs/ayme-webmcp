import type { z } from "zod";

abstract class CounterIdFactory<TSchema extends z.ZodTypeAny> {
  private _counter = 0;

  protected abstract get prefix(): string;

  protected abstract get schema(): TSchema;

  create(): z.infer<TSchema> {
    this._counter += 1;
    const id = `${this.prefix}_${this._counter}`;
    return this.schema.parse(id);
  }

  reset(): void {
    this._counter = 0;
  }
}

export { CounterIdFactory };
