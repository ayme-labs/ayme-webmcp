import { z } from "zod";

export const MonotonicTimeMsSchema = z
  .number()
  .finite()
  .nonnegative()
  .brand<"MonotonicTimeMs">();
export type MonotonicTimeMs = z.infer<typeof MonotonicTimeMsSchema>;
