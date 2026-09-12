# Playwright Lite migration

Replace the workspace browser adapter with the Ayme Playwright Lite fork, pinned to an exact Git commit and bundled into WebMCP. No registry release or new application-facing configuration is required.

The upstream root contract remains `createPage` and `CreatePageOptions`. The fork's internal entry preserves dual ARIA capture and the existing locator-to-DOM operations needed by the registry. POM reachability stays in WebMCP and must not add a runtime extension.

WebMCP translates its existing compiler-defined test ID and timeout settings into `createPage(options)`. Page creation stays lazy and browser-owned so the SSR lifecycle is unchanged.

## Required verification

- Install the Git dependency from a fresh package store with the explicit build allowlist and frozen lockfile.
- Build and typecheck all packages without the removed workspace adapter.
- Run the existing registry, structural capture/ref identity, publication, configuration, and packed-consumer tests.
- Run the Vue/Vite, React/Vite, and Next.js examples, including SSR and hydration checks.
- Keep the fork's stock Playwright corpus and reviewed baseline unchanged. Verify the separately pinned Ayme injected artifact and its capture regression test.
- Confirm WebMCP's packed output bundles the runtime and retains third-party notices. A consumer must not install the Git dependency or run its build.

This migration does not fix evaluation serialization discrepancies or change POM availability policy. Those remain separate work.
