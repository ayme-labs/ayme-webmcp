import { z } from "zod";

export const StructuralActionIdSchema = z
  .string()
  .brand<"StructuralActionId">();
export type StructuralActionId = z.infer<typeof StructuralActionIdSchema>;
