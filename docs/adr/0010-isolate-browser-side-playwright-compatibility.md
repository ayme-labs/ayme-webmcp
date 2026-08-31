---
status: accepted
---

# Isolate browser-side Playwright compatibility

Page Object Models should continue using the public `Page` and `Locator` types exported by `@playwright/test`, while the WebMCP browser runtime needs an in-page implementation of the supported surface. Keeping that implementation inside `@ayme-dev/webmcp` mixes Playwright compatibility with the wider WebMCP runtime, while extracting source from Playwright's distributed bundle creates a brittle dependency on its build output.

## Considered options

- Keep the browser Page and Locator implementation inside `@ayme-dev/webmcp`.
- Extract InjectedScript from Playwright's distributed bundle.
- Isolate compatibility in a private package generated from pinned Playwright source.

## Decision

Create the private, source-exporting Just-in-Time Turbo package `@ayme-dev/playwright-browser`.

The package owns `BrowserPage`, `BrowserLocator`, and browser-page construction. `@ayme-dev/webmcp` may consume the package but does not re-export its interface. Existing repository consumers move directly to the new package without a compatibility bridge.

Consumer Page Object Models continue importing `Page` and `Locator` from `@playwright/test`. They do not adopt Ayme-specific base classes or duplicate their Playwright-facing declarations.

The package implements an explicitly selected subset of the public `Page` and `Locator` interfaces available through `@playwright/test`, within one active top-level document and main realm.

Package-local live resources define:

- The pinned upstream version and provenance.
- The exhaustive public compatibility catalog.
- The currently supported member selection.
- The public-surface and generated-source fingerprints.

The catalog separates API compatibility—Full, Partial, or Unsupported—from execution fidelity—Matched or Browser-emulated. A behavioral execution difference does not make an otherwise compatible interface Partial.

The POM compiler consumes the catalog and current selection to diagnose unavailable usage before browser execution. Changing the compatibility ceiling does not automatically change the currently supported surface.

Generate the private InjectedScript module from pinned, unmodified Playwright source at maintainer time. Normal package builds consume the generated artifact offline and hermetically. Do not parse Playwright's distributed bundle or evaluate extracted source at runtime.

Reuse Playwright's browser-side selector, state, actionability, serialization, and accessibility primitives. Keep browser-runtime orchestration outside the generated module and inside `@ayme-dev/playwright-browser`.

Upstream changes require explicit manifest review. New or changed members are never promoted into current support automatically.

## Consequences

Playwright compatibility has one package-local source of truth and one implementation seam.

The package is intentionally coupled to pinned Playwright source, but that coupling is isolated and mechanically reviewable.

The browser implementation remains a documented best-effort substitute rather than Playwright's server runtime.

The package extraction is a breaking internal change with no compatibility re-exports.

Version pins, member classifications, current support, provenance, and upgrade procedures evolve through the live package resources without rewriting this ADR.
