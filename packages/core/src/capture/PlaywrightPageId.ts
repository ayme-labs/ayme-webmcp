import { z } from "zod";

export const PlaywrightPageIdSchema = z.string().brand<"PlaywrightPageId">();
export type PlaywrightPageId = z.infer<typeof PlaywrightPageIdSchema>;
