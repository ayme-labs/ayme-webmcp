---
status: accepted
---

# Use Devbox and Corepack for local runtimes

## Context

The repository should align with Ayme local environment management while keeping its runtime configuration minimal.

## Considered options

- OC1: Use Devbox with Node 24 and Corepack with an exact pnpm version.
- OC2: Use Node version files without Devbox.
- OC3: Depend on system runtimes.

## Decision

Use nodejs@24, set DEVBOX_COREPACK_ENABLED=true, declare an exact pnpm 11 version in the root packageManager field, and commit devbox.lock.

## Consequences

The repository does not add .nvmrc or .node-version.

The repository does not copy Ayme-specific Git, uv, or NODE_OPTIONS configuration.

## Validation

devbox run -- node --version and devbox run -- pnpm --version report the declared runtime families.
