## Agent skills

### Issue tracker

Issues and specs live as Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.

### Architectural decisions

Canonical ADRs live under `docs/adr/`. When using Grove, create the ADR first, then add a `D` record that references it without duplicating its rationale. Supersede decisions in both places, and read the referenced ADR before working on a linked work item.

Before creating or superseding an ADR, present the complete proposed ADR to the user and wait for explicit approval. After approval, write the ADR and create the corresponding Grove decision or superseding decision. Never infer ADR approval from general agreement with a plan.

A single approval covers the complete supersession operation. Mark the old ADR as `superseded by ADR-NNNN`, keep the replacement ADR accepted and explicit about which ADR it supersedes, and create a pointer-only Grove `D` record with a `supersedes` edge to the old decision. Keep the old ADR and Grove decision rationale intact.

## Development environment

- Start a persistent Devbox shell and run all project commands inside it.
- If Devbox is unavailable, surface the environment blocker.
