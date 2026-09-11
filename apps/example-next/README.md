# Next.js / Turbopack prototype

This spike runs Ayme's existing POM compiler and React integration in a Next.js
16.3.4 App Router app. Both development and production use Turbopack. The Ayme
React subtree is server-rendered, then the browser runtime activates after
hydration. This is still a prototype, not general Next.js support.

There is no `webmcp-next` package, Vite process, webpack fallback or server-side
Page Object runtime.

## Run

Start a Devbox shell at the repository root, then run:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@ayme-dev/example-next...
pnpm --filter @ayme-dev/example-next dev
```

Open http://127.0.0.1:4192. The counter supports a normal button click and a call
through `usePageObject(CounterPage)`. It can be removed and remounted.

## What changed

`@ayme-dev/unplugin-webmcp/turbopack-loader` is an experimental ESM loader using
the webpack loader calling convention supported by Turbopack. It calls the same
source transform as Vite, then transpiles the result with the package's existing
TypeScript dependency. Its only configuration option is `tsconfigPath`.

The Next config applies it to decorated `.ts` files on the browser graph.
Turbopack loads the built package entry, not a source-file alias. The workspace
root is explicit so linked Ayme packages resolve. Dev and production outputs
use separate directories.

The React runtime session now creates its default browser page lazily. During a
server render, `usePageObject` returns an unconstructed object with the POM
prototype and does not register it. The provider can therefore render the same
UI on the server without a fake DOM or fake Playwright implementation. The
browser constructs and registers the real POM during hydration, and runtime
activation still happens in the existing effect.

## Verify

After building, with no manually started server running:

```sh
pnpm --filter @ayme-dev/example-next exec playwright install chromium
pnpm --filter @ayme-dev/webmcp test
pnpm --filter @ayme-dev/webmcp-react test
pnpm --filter @ayme-dev/unplugin-webmcp test
pnpm --filter @ayme-dev/example-next test:e2e
```

`test:e2e` runs the same tests against `next dev` and `next start`. Build first.
With JavaScript disabled, the test requires the server response to contain the
counter, output, publication state and POM action button. With JavaScript
enabled, the test checks hydration, the compiled POM through the React hook,
the same POM through real Playwright, removal and remounting, and browser errors.

The branch workflow also runs the existing React/Vite browser tests, package
type checks, lint, formatting and dependency checks. It uses the committed
lockfile and has no write permission.

## Deliberate limits

Server rendering is presentation-only for Ayme. Page Object constructors,
locators, actions, DOM observation and WebMCP publication remain browser-only.
Rendering code must not read Page Object locator fields or execute Page Object
actions on the server. Prototype methods exist on the server placeholder so
normal event closures can reference them without running the constructor.

WebMCP publication remains disabled in the Next example. The loader does not
replace the existing `__AYME_WEBMCP_PUBLISH__` build constant. Default test-id
and timeout settings are unchanged. The next experiment is publication
configuration without Vite's `define` hook, including a stable server snapshot
when publication is enabled.

Server Component POM execution, Edge deployments, Pages Router, source-map
fidelity and packaged-consumer certification are not covered. POMs must use
`.ts` and the existing explicit `@WebMCP` convention.

The compiler reads TypeScript project files from disk. This loader does not
report imported type/config dependencies to Turbopack yet. Restart Next after
changing them. Full POM hot replacement and cross-file metadata invalidation
need separate checks before this can become a supported integration.

## References

- [Turbopack rules and loader limitations](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Existing React integration](../../packages/webmcp-react/README.md)
- [Framework API parity decision](../../docs/adr/0017-keep-framework-integration-apis-closely-aligned.md)
