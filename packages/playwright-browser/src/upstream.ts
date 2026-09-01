/** Pinned inputs are reviewed here before changing catalog or generated source. */
const version = "1.62.1";

export const upstreamPlaywright = {
  package: "@playwright/test",
  version,
  provenance: `https://github.com/microsoft/playwright/tree/v${version}`,
  publicSurfaceFingerprint:
    "sha256:614480ae0d18f583f75f1358bf3813e984e98ef2fec83bc4a9f160f0793b4268",
  generatedSource: {
    status: "verified" as const,
    fingerprint:
      "sha256:7de5f27b28ba4a08ff4f7ee080f2adecc1847a7719dbf9d31ca032aa4e4d43ba",
  },
} as const;
