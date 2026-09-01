# Generated Playwright browser runtime

`src/generated/injectedScript.js` is a static ESM artifact built from the
24-file source closure under `source/playwright-1.62.1`. The pinned upstream is
Microsoft Playwright v1.62.1 at commit `26a9e470a7b3c7822084b09fb7f13902c5f37b51`.
Vendored TypeScript filenames carry a storage-only `.source` suffix so workspace
dependency analysis does not interpret Playwright's private path aliases as this
package's dependencies. The generator restores the original filenames in a
temporary directory before bundling; source bytes and recorded hashes are
unchanged.

The runtime source closure plus license/notice hashes are recorded in the
reviewed `source-closure.json`; input, output, and closure hashes are exported from
`src/generated/provenance.ts`. `LICENSE`, `NOTICE`, and
`ThirdPartyNotices.txt` beside the source closure retain the upstream Apache-2.0
license and attribution.

For a reviewed update, replace the closure with files from the new upstream tag,
update the independently reviewed hashes in `source-closure.json` and the pin in
`src/upstream.ts`, then run:

```sh
pnpm --filter @ayme-dev/playwright-browser generate:runtime
pnpm --filter @ayme-dev/playwright-browser verify:runtime
pnpm --filter @ayme-dev/playwright-browser smoke:runtime
```

Normal builds do not regenerate the artifact. The package test gate runs
`check:runtime`, which fails when the trusted source closure, legal files,
artifact, declaration, or provenance drifts. The generator never rewrites the
trusted source-closure manifest.

The publishable `@ayme-dev/webmcp` bundle inlines this private package and copies
the Playwright license, notice, and third-party notices into its `dist` output;
published consumers never resolve `@ayme-dev/playwright-browser` themselves.

The generator applies four deterministic, fail-closed output substitutions to
the pinned bundle: it replaces `UtilityScript.evaluate`'s `global.eval` call;
rejects custom selector-engine registration instead of evaluating its source;
replaces `InjectedScript.eval`; and replaces `InjectedScript.extend`. Each
replacement throws the same `dynamicSourceIsDisabled` error. Generation fails
unless every expected emitted form occurs exactly once, and a final scan rejects
any remaining `eval(` or `Function(` call. This keeps the reviewed selector,
state, actionability, and ARIA primitives while explicitly disabling the
unsupported dynamic-source APIs.
