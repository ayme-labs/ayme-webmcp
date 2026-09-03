export type CaptureAriaSnapshotResult = {
  distilledText: string;
  fullText: string;
  refsByElement: Map<Element, string>;
};

export type TraceEntry = {
  operation: "click" | "fill" | "waitFor";
  locator: string;
  state?: "visible" | "hidden";
  value?: string;
};

export type BrowserInteractionPacing = {
  beforeActionMs?: number;
  clickCue?: boolean;
  typingIntervalMs?: number;
};
