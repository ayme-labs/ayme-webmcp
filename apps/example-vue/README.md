# Vue WebMCP POM spike

This is a throwaway browser-side experiment for the Ayme WebMCP design. The page is split into a functional list app and an Ayme debug console so the same POM tool can be exercised from either side.

- The demo app lets you add items and archive them through a confirmation dialog.
- `ListPage` is a normal TypeScript class using `Page` and `Locator` types from Playwright. Vite bundles that same class for WebMCP and constructs it with the DOM-backed browser implementation.
- `@WebMCP` and `@WebMCP.tool()` choose the production WebMCP surface. Tool descriptions come from the decorator.
- Registered page tools use their fully qualified POM method name, such as `ListPage.addItem`. A collection component action is registered once, at its collection path, such as `ListPage.items.archive`.
- A collection component action receives a generated `index` followed by an `args` object derived from its TypeScript method parameters: `ListPage.items.archive({ index: 0, args: {} })`.
- The bundler-neutral POM compiler reads the nearest `tsconfig.json` and derives each decorated method's input schema and each public `BrowserLocator` member as POM metadata. The Vite plugin is a thin adapter that places this metadata in the browser bundle. It derives nested, JSON-shaped object inputs too; the decorator does not duplicate parameter types or schemas.
- POM metadata also describes components constructed from a locator root, including repeated components exposed as paths such as `items[0].archiveButton`.
- The Vue-only `useAymeExperiment()` composable registers the imported POM instance. No `.ayme/index.ts` participates in browser registration.
- The runtime publishes the same registered tool objects to `document.modelContext` and the in-page debug console.
- The POM inspector probes registered members against the current DOM and refreshes when the demo changes. It does not use framework bindings or element identity.
- The browser runtime is DOM-backed. It supports the locator operations used by the POM, including role/name lookup, filling, clicking, and visible/hidden waits, without requiring Playwright at runtime.

Run from this directory:

```sh
pnpm install
pnpm run typecheck
pnpm run test:browser
```

The browser test injects a minimal `document.modelContext`, verifies the two published tools and their compiler-derived schemas, exercises direct list interaction, then invokes the published collection WebMCP tool and the same tool through the debug console against the real DOM-backed runtime.
