# Next.js / Turbopack prototype

This branch asks whether Ayme's existing POM compiler and React integration can
work in a Next.js App Router app using Turbopack for development and production.
It is a throwaway compiler spike, not a declaration of general Next.js support.

Next.js is pinned to 16.3.4, the npm `latest` release checked on September 11,
2026. The app uses the existing `@ayme-dev/webmcp-react` package. There is no
`webmcp-next` package, Vite process, webpack fallback or runtime redesign.

## Run

Start a Devbox shell at the repository root, then run:

```sh
pnpm install --no-frozen-lockfile
pnpm exec turbo run build --filter=@ayme-dev/example-next...
pnpm --filter @ayme-dev/example-next dev
```

Open http://127.0.0.1:4192. The counter supports a normal button click and a call
through `usePageObject(CounterPage)`. It can be removed and remounted.

The initial branch needs dependency resolution for the new workspace. After
`pnpm-lock.yaml` includes `apps/example-next`, use `pnpm install --frozen-lockfile`.
Do not hand-edit dependency hashes. The branch verification workflow also
resolves and commits the lockfile before checking the app.

## What changed

`@ayme-dev/unplugin-webmcp/turbopack-loader` is an experimental ESM loader using
the webpack loader calling convention supported by Turbopack. It calls the same
source transform as Vite, then transpiles the result with the package's existing
TypeScript dependency. Its only configuration option is `tsconfigPath`.

The Next config applies it to decorated `.ts` files on the browser graph.
Turbopack loads the built package entry, not a source-file alias. The workspace
root is explicit so linked Ayme packages resolve. Dev and production outputs
use separate directories.

The page and layout remain Server Components. `client-example.tsx` uses
`next/dynamic` with `ssr: false` for the entire Ayme subtree. A `use client`
directive alone would still allow server prerendering. The current provider
constructs a page using `window`, and its status hook has no server snapshot.
This prototype avoids those paths rather than changing the React package.

## Verify

After building, with no manually started server running:

```sh
pnpm --filter @ayme-dev/example-next exec playwright install chromium
pnpm --filter @ayme-dev/unplugin-webmcp test
pnpm --filter @ayme-dev/unplugin-webmcp typecheck
pnpm --filter @ayme-dev/example-next typecheck
pnpm --filter @ayme-dev/example-next lint
pnpm --filter @ayme-dev/example-next test:e2e
```

`test:e2e` runs the same tests against `next dev` and `next start`. Build first.
The checks require the server shell to load without JavaScript, the compiled
Page Object to work through the React hook, and the same POM to work with real
Playwright. They also exercise removal and remounting and reject browser errors.
A working ordinary button alone is not a passing result.

These are executable checks, not recorded passes. Local build and browser
verification were blocked in the authoring environment by unavailable Devbox
and network access. Consult the branch's Actions run for execution results.

## Deliberate limits

WebMCP publication remains disabled. The loader does not replace the existing
`__AYME_WEBMCP_PUBLISH__` build constant. It does not add a driver or fabricate
manifests in the example. Default test-id and timeout settings are unchanged.
The next experiment is publication configuration without Vite's `define` hook.

SSR of the Ayme subtree, Server Component POM execution, Edge deployments,
Pages Router, source-map fidelity and packaged-consumer certification are not
covered. POMs must use `.ts` and the existing explicit `@WebMCP` convention.

The compiler reads TypeScript project files from disk. This loader does not
report imported type/config dependencies to Turbopack yet. Restart Next after
changing them. Full POM hot replacement and cross-file metadata invalidation
need separate checks before this can become a supported integration.

## References

- [Turbopack rules and loader limitations](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)
- [Skipping Client Component prerendering](https://nextjs.org/docs/app/guides/lazy-loading#skipping-ssr)
- [Existing React integration](../../packages/webmcp-react/README.md)
- [Framework API parity decision](../../docs/adr/0017-keep-framework-integration-apis-closely-aligned.md)
