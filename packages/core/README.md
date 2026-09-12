# @ayme-dev/core

MIT structural observation for browser and Node.js consumers. The package provides compiled ESM and TypeScript declarations through two exports:

```sh
npm install --save-exact @ayme-dev/core@alpha
```

The package is in alpha. Pin its exact version because releases may contain breaking changes without notice.

## Publishing

npm requires a package to exist before it can trust a GitHub Actions publisher. An npm maintainer for the `@ayme-dev` scope must publish the first alpha from a clean `main` checkout:

```sh
pnpm --filter @ayme-dev/core test:package
cd packages/core
npm publish --tag alpha
```

Then configure the package's [trusted publisher](https://docs.npmjs.com/trusted-publishers/) for GitHub owner `ayme-labs`, repository `ayme`, and workflow `publish-core.yml`, with direct publishing allowed. For later alphas, bump the prerelease version on `main` and manually run the `Publish core alpha` workflow.

```ts
import {
  StructuralTree,
  SyntheticAriaRefFactory,
} from "@ayme-dev/core/structural-observation";
import {
  StructuralTreeMockFactory,
  MockLiveAriaSnapshotSource,
} from "@ayme-dev/core/structural-observation/testing";

const tree = StructuralTree.fromAriaSnapshotYaml(
  '- button "Save" [ref=e1]',
  new SyntheticAriaRefFactory()
);
```

The module includes structural trees and reconciliation, optional typed enrichment, paired capture evidence, observation sessions and history, generic projection, and compact rendering. Raw SVG descendants remain in evidence and change trees. Callers own capture adapters and presentation policy.

`getBeforeNodeForAfterRef` reports matching against a raw after-capture ref, including unchanged matches and synthetic refs. `wasBeforeRefAmbiguous` distinguishes ambiguous removed refs from ordinary removals. These are reconciliation facts; document alias lifetime and element resolution belong to consumers.

The testing export contains only `StructuralTreeMockFactory` and `MockLiveAriaSnapshotSource`. Both are independent of a testing framework. Test suites are excluded from the package.

## ARIA type compatibility

The package owns the existing public repository's structural `AriaNode` and `AriaRole` definitions in `tree/StructuralTypes.ts`. Playwright's public package does not export its internal ARIA type entry. `StructuralNode.fromAriaNode` accepts the compatible owned shape without importing Playwright or any workspace package. Zod is the sole runtime dependency. The ARIA definitions' upstream notice is retained in `THIRD_PARTY_NOTICES.txt`.

`pnpm --filter @ayme-dev/core test:package` builds and packs a candidate, installs it outside the workspace, exercises both runtime exports, checks declarations with NodeNext and Bundler resolution, checks assignability from the pinned public Playwright ARIA definition, and bundles both exports for the browser. It checks the bundle input graph and writes the tarball manifest and SHA-256 to `verification.json`. An optional directory argument retains the artifact at a chosen location.
