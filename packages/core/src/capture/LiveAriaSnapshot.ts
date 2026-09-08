import type { PlaywrightPageId } from "./PlaywrightPageId";

export type LiveAriaSnapshot = Readonly<{
  distilledYaml: string;
  undistilledYaml: string;
}>;

export interface LiveAriaSnapshotSource {
  captureAriaSnapshot(
    pageId: PlaywrightPageId,
    options?: { timeout?: number }
  ): Promise<LiveAriaSnapshot>;
}
