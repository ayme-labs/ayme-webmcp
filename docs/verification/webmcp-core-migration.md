# WebMCP core migration evidence

WebMCP now consumes the compiled `@ayme-dev/core/structural-observation` entry point. Its distributable bundles that dependency, following the existing WebMCP packaging convention. The shared package remains independently consumable by private Ayme.

The baseline is public main `aaa0aa9b7f2403b7747be77f23fbce8347588cba`, the merge of PR #44. It includes PR #21 and follows the planning baseline `fdc463574ee63c55385a9aa40fcd2d9be64fd4ad`.

## Behavior evidence

| Behavior                                                             | Implementation disposition                                                                               | Validation                                                                                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ref matching, lineage, conservative ambiguity, synthetic continuity  | Uses core's existing reconciliation and factual queries                                                  | Core tree and lineage tests; unchanged Ayme facade tests                                                                                                            |
| Root placement, nesting, sibling order, descendant uniqueness        | Moved consumer policy to `webmcp/src/pomRootPlacement.ts`; uses core nodes and navigation                | Existing page-state snapshots and migrated capture construction tests                                                                                               |
| Ref-less wrappers, promoted text and nodes, omitted leaves           | WebMCP selects from core's parsed tree without changing generic parsing                                  | Capture tests verify order, properties, literal ref tokens, and unchanged synthetic allocation                                                                      |
| Labels and current page-state text                                   | WebMCP chooses inline POM labels, literal ref prefixes, and `/pom` properties through generic projection | Existing page-state and Vue demo snapshots pass without updates                                                                                                     |
| DOM correlation and per-document aliases                             | Remain in `pageState.ts`; registration and document policy unchanged                                     | Facade tests cover resolved, unknown, removed, ambiguous, and no-element results; browser test covers repeated replacement                                          |
| Enrichment, compaction, exclusions, capture/session/history, raw SVG | Remain in core; no consumer defaults added                                                               | Core's 191 tests, including projection, capture, timeline, and enrichment checks                                                                                    |
| Independently installed core                                         | Both compiled subpaths, no private resolution or browser runtime                                         | `packages/core/scripts/verify-package.mjs` checks ESM imports, NodeNext and Bundler declarations, public Playwright type compatibility, and a closed browser bundle |
| Packed WebMCP                                                        | Bundles core and the browser adapter                                                                     | Packed tests install and import both entry points and check consumer declarations with absent, minimum, and current supported Playwright peers                      |
| Browser and demo                                                     | Existing behavior preserved                                                                              | Browser facade test and all nine Vue demo workflows                                                                                                                 |

The only core correction removes an empty header segment when rendering a generic node with a custom prefix. A focused test first reproduced `- e1 :` and now expects `- e1:`. No POM, DOM, session alias, SVG presentation, or product policy moved into core.

The package verification command also accepts `--built` for Turbo's e2e task, whose build prerequisite already supplies the artifact. This avoids cleaning shared `dist` during concurrent consumer builds and tests. Standalone candidate verification still rebuilds. WebMCP typechecking now waits for dependency builds because core exports compiled declarations.

The superseded `packages/structural-observation` package was removed after core tests, focused consumer checks, browser facade, packed consumer checks, and demo workflows passed. The four consumer construction tests moved into WebMCP; private-style enrichment and SVG policy tests in the obsolete copy were not transplanted into the public consumer.

## Candidate handoff

The merged baseline was rebuilt and verified independently. Its SHA-256 is `fa5d0168e5cce2cb6b7ccf4c0653ed40d91476992244b9f05e8e77028f2dbaaf`.

Durable artifacts live outside build output under `~/.codex/artifacts/structural-observation/`. Each candidate directory contains `ayme-dev-core-0.1.0.tgz`, `verification.json` with the exact source revision and SHA-256, and the verification log. The PR records the final candidate's revision and hash. Preserve these directories until both consumer PRs have been reviewed.

Private Ayme must rerun its installed-artifact checks against the corrected candidate. No npm publication, prerelease, merge, parent-issue closure, private source edit, or experiment migration is part of this change. A private dependency on the unpublished candidate remains a merge prerequisite for that consumer.

## Validation notes

All commands run in a persistent Devbox shell. A session-local `PNPM_HOME` avoided an unwritable user tool directory. Initial demo snapshot failures used the WebMCP build from before the core whitespace correction; rebuilding restored the unchanged snapshots. One debug-console workflow also failed on that first run and passed on the complete rerun.

Builds report the existing Vue chunk-size and plugin-timing warnings. This work makes no latency or PR #553 compatibility claim.

The full local `pnpm check` passed. The upstream compatibility report reconciled 519 cases with zero regressions against the 260-case reviewed baseline. It classified 274 candidate passes, 242 failures, one skip, and two diagnostic-only passes. These counts do not claim universal upstream support or promote unreviewed candidates. CI initially exposed the concurrent clean/build race described above; the affected-task command is rerun from absent core output to verify the dependency fix.
