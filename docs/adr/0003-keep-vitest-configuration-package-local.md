---
status: accepted
---

# Keep Vitest configuration package-local

## Context

Turbo should execute each workspace test task, but a shared Vitest configuration package is unnecessary at the current repository size.

## Considered options

- OC1: Keep Vitest configuration in each applicable workspace.
- OC2: Configure Vitest projects at the repository root.
- OC3: Create a shared Vitest configuration package.

## Decision

The example application and both public packages own their Vitest configuration, with no root or shared Vitest configuration package.

## Consequences

A small amount of configuration duplication is accepted.

Empty public package shells do not receive fake tests.

## Validation

The root test command runs package tasks, and the real example application test passes.
