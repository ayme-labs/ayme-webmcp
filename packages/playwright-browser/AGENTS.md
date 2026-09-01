# Playwright browser package

Keep the exhaustive catalog, current support, and upstream metadata separate.
When upgrading Playwright, review the pinned upstream metadata, regenerate the
public-surface fingerprint, classify every changed member, and only then amend
the selected support. Run `pnpm fingerprint:surface` to print the fingerprint
for the reviewed declarations, record it in `src/upstream.ts`, then run
`pnpm check:surface`. Generated InjectedScript source belongs to its dedicated
generation workflow, not to normal package builds.
