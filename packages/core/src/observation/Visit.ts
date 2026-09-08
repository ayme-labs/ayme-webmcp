import { z } from "zod";

export const VisitIdSchema = z
  .string()
  .regex(/^visit_\d+$/)
  .brand<"VisitId">();
export type VisitId = z.infer<typeof VisitIdSchema>;

export const VisitStartedCauseSchema = z.enum([
  "initial",
  "navigate",
  "openPage",
]);
export type VisitStartedCause = z.infer<typeof VisitStartedCauseSchema>;
