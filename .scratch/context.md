# Dev Flow Context

## Attention Surfaces

### A-001 — Structural page state and identity
- Level: Engagement
- The user is actively defining how Playwright ARIA refs, StructuralTree nodes, and Page Object evidence form one observable page-state model.

### A-002 — Capture ownership and package boundaries
- Level: Engagement
- The user is actively shaping the Playwright fork seam, injected-runtime ownership, copied Ayme domain sources, package names, and dependency direction.

### A-003 — Page Object binding edge cases
- Level: Engagement
- The user is actively distinguishing locator cardinality, hidden roots, omitted ARIA nodes, synthetic refs, iframe scope, and later action addressing.

### A-004 — Coordinated delivery
- Level: Engagement
- The user wants small waves coordinated across existing Codex tasks and repositories, ending in open pull requests without merging, and has repeatedly required explicit approval before mutations.

### A-005 — Playwright fork governance
- Level: Neutrality
- The user wants eventual Ayme Labs ownership tracked, but does not want the fork moved as part of the current implementation effort.

## Proposals

- P-001 — Use Structural Refs as capture-scoped node identity
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: A Playwright ARIA ref identifies the StructuralNode and exact observed element within the current capture and action window. Ref continuity across captures or navigation is not required for the first implementation.

- P-002 — Defer cross-capture reconciliation
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: Ayme-style reconciliation may be introduced later if continuity becomes necessary, but it is not part of the current StructuralTree or page-state slice.

- P-003 — Capture the full Playwright ARIA tree with all refs
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: The private full capture uses Playwright's internal `refs: "all"` behavior, or the equivalent supported capture mode, so every represented ARIA node receives a ref.

- P-004 — Produce distilled and full state from one capture
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: The distilled AI tree and undistilled full tree come from the same Playwright-generated tree and share one ref namespace. The implementation must not independently recapture the two views.

- P-005 — Evolve get_page_state toward StructuralTree output
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: `get_page_state` is the public composition point. The existing raw ref-bearing ARIA state is the baseline; a later integration slice converts the dual capture into a POM-aware StructuralTree representation.

- P-006 — Reuse Ayme POM decoration rules
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: Reuse the StructuralTree projection and POM-decoration rules established by Ayme PR #553 instead of inventing a new decoration model.

- P-007 — Define the first decoration surface
  - Origin: Agent
  - Area: A-001
  - Status: Outdated
  - Content: Decide whether the first integrated `get_page_state` decorates only POM roots or also uniquely resolved locator members, and whether its serialized output uses the copied compact StructuralTree renderer or preserves Playwright's raw YAML shape.

- P-008 — Use the Ayme Playwright fork
  - Origin: User
  - Area: A-002
  - Status: Accepted
  - Content: Use `enekesabel/playwright` branch `ayme/main` as the Playwright source and allow a focused fork change that exposes dual capture with `refs: "all"`. Pin an exact reviewed commit or pull-request head rather than consuming the moving branch.

- P-009 — Keep one Playwright-owned injected implementation
  - Origin: User
  - Area: A-002
  - Status: Accepted
  - Content: Reuse Playwright's InjectedScript and ARIA semantics. Do not inject an independent Ayme ARIA implementation or copy Playwright's accessibility engine into WebMCP. Ayme-specific behavior stays behind a narrow internal adapter or focused fork extension.

- P-010 — Align the fork with Playwright 1.62.1
  - Origin: Agent
  - Area: A-002
  - Status: Accepted
  - Content: Align the fork baseline with the exact Playwright 1.62.1 version currently used by ayme-webmcp so the capture runtime and WebMCP dependency do not diverge.

- P-011 — Expose one Ayme-specific capture operation
  - Origin: Agent
  - Area: A-002
  - Status: Outdated
  - Content: Expose one decision-complete internal operation returning the distilled snapshot, undistilled snapshot, and `Element` to ref map from one capture. The exact method name and returned field names remain undecided.

- P-012 — Copy the Ayme StructuralTree domain temporarily
  - Origin: User
  - Area: A-002
  - Status: Accepted
  - Content: Temporarily duplicate the proven StructuralTree domain sources from Ayme into ayme-webmcp. Eventual co-location in one monorepo or shared package is possible but does not block the current work.

- P-013 — Place StructuralTree in a private JIT package
  - Origin: User
  - Area: A-002
  - Status: Accepted
  - Content: Add the copied StructuralTree domain as the private Just-in-Time Turbo package `@ayme-dev/structural-observation` under `packages/structural-observation`.

- P-014 — Name the browser package playwright-browser
  - Origin: User
  - Area: A-002
  - Status: Accepted
  - Content: Use the private Just-in-Time Turbo package name `@ayme-dev/playwright-browser` under `packages/playwright-browser` for browser-side Playwright compatibility and generated InjectedScript ownership.

- P-015 — Keep the StructuralTree package Playwright-free
  - Origin: Agent
  - Area: A-002
  - Status: Accepted
  - Content: `@ayme-dev/structural-observation` depends on neither Playwright nor WebMCP. It accepts structural data and owns nodes, trees, projection, enrichment, synthetic refs, and rendering. `@ayme-dev/webmcp` composes it with `@ayme-dev/playwright-browser`.

- P-016 — Copy the domain kernel intact
  - Origin: Agent
  - Area: A-002
  - Status: Accepted
  - Content: Copy the relevant Ayme domain files and focused tests intact, including currently unused reconciliation methods, while excluding capture services, timelines, tracing, and framework integration. This preserves provenance and avoids a redesign during extraction.

- P-017 — Replace the earlier @ayme-dev/playwright package name
  - Origin: Agent
  - Area: A-002
  - Status: Superseded
  - Content: An earlier package-layout proposal used `@ayme-dev/playwright`; the accepted package name is now `@ayme-dev/playwright-browser`.

- P-018 — Use real refs before synthetic refs
  - Origin: User
  - Area: A-003
  - Status: Accepted
  - Content: When a captured POM boundary maps to a Playwright ARIA ref, that ref is its StructuralNode identity. Synthetic refs are used only for eligible emitted structural boundaries that Playwright omitted from the ARIA tree.

- P-019 — Restrict synthetic refs to observable unique roots
  - Origin: User
  - Area: A-003
  - Status: Accepted
  - Content: A uniquely resolved, current-document, agent-observable POM root omitted from ARIA may receive a capture-scoped synthetic `s_*` ref. Hidden, missing, ambiguous, out-of-scope, or cross-frame roots do not receive an agent-visible synthetic StructuralNode.

- P-020 — Handle missing refs in the integration slice
  - Origin: User
  - Area: A-003
  - Status: Accepted
  - Content: Real-versus-synthetic ref correlation belongs in the later WebMCP integration slice, not in the pure StructuralTree package or the Playwright fork.

- P-021 — Keep iframe exclusion in a separate ADR
  - Origin: User
  - Area: A-003
  - Status: Accepted
  - Content: Initial capture is limited to the active top-level document and main realm. Iframe traversal and per-frame composition are unsupported initially and documented in an ADR separate from StructuralRef identity.

- P-022 — Defer index replacement and highlighting
  - Origin: User
  - Area: A-003
  - Status: Accepted
  - Content: Replacing collection `{ index, args }` addressing with StructuralRefs, using refs in additional POM action tools, and generic highlighting are follow-up work. They are not part of the current capture, StructuralTree package, or first integration scope.

- P-023 — Treat locator cardinality as already handled elsewhere
  - Origin: User
  - Area: A-003
  - Status: Open
  - Content: The user proposed that zero and multiple POM-root matches are handled by task `01a05808-b9aa-7fb0-ba3a-5d0ba08b617f`. Inspection shows that task defines tool presence as `root.count() > 0` and does not map individual matched elements to StructuralRefs, so the StructuralTree behavior for multiple matches still requires alignment.

- P-024 — Separate live tool availability from structural observability
  - Origin: Agent
  - Area: A-003
  - Status: Open
  - Content: Task `01a05808-b9aa-7fb0-ba3a-5d0ba08b617f` settles page registration, Ayme-owned observation, root-count-based child-tool activation, and publisher synchronization. It does not settle element-to-ref correlation, synthetic refs, multiple structural occurrences, or hidden-root representation. A hidden DOM root can therefore activate tools while remaining absent from AI-visible page state unless the integration policy says otherwise.

- P-025 — Decorate every real-ref occurrence on multiple matches
  - Origin: Agent
  - Area: A-003
  - Status: Open
  - Content: For a locator resolving to several elements, consider decorating every matched element that maps to a real Playwright ref, while reserving synthetic refs for uniquely resolved omitted roots. This remains an integration decision and is not accepted yet.

- P-026 — Reject a combined iframe and index-addressing ADR
  - Origin: User
  - Area: A-003
  - Status: Rejected
  - Content: Iframe exclusion and replacement of collection indexes must not be combined into one ADR. Iframes have their own architectural decision; index replacement remains a separate follow-up task.

- P-027 — Work in small coordinated waves
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Do not attempt the entire end-to-end feature at once. Start independent capture and StructuralTree foundations while discussing later correlation details, and use explicit checkpoints between waves.

- P-028 — Open three prerequisite pull requests
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: The current coordinated initiative targets three prerequisite pull requests: the Playwright fork capture change, the playwright-browser capture foundation, and the StructuralTree kernel package. Pull requests are opened for review but not merged by the coordinator.

- P-029 — Open a stacked integration pull request
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: After the prerequisite foundations exist, open a Wave 2 WebMCP integration pull request stacked on their WebMCP branches instead of requiring all browser-compatibility work to finish or merge first.

- P-030 — Permit narrow temporary duplication
  - Origin: User
  - Area: A-004
  - Status: Outdated
  - Content: If waiting for task `01a05796-d126-7631-916c-6cb1597a6bf3` would block progress for too long, allow the minimum duplicated capture plumbing needed for StructuralTree work and synchronize it with the compatibility package in a follow-up.

- P-031 — Split the compatibility coordinator at its capture foundation
  - Origin: Agent
  - Area: A-004
  - Status: Outdated
  - Content: Reshape task `01a05796-d126-7631-916c-6cb1597a6bf3` so its package-contract and generated-runtime work opens a narrow foundation pull request before its wider Page and Locator compatibility implementation. Build StructuralTree work on that foundation and continue the remaining compatibility work afterward, avoiding throwaway duplication.

- P-032 — Reconcile existing ADR and Grove ID collisions first
  - Origin: Agent
  - Area: A-004
  - Status: Outdated
  - Content: Before stacking new WebMCP work, repair PR #9 and the compatibility branch against current main. PR #9 currently conflicts with main through reused Grove goal and work IDs, while the compatibility branch and PR #9 both claim ADR and Grove decision 09.

- P-033 — Require explicit approval before mutations
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Discussion and inspection do not authorize code changes, task creation, branches, worktrees, issues, or ADRs. Present the complete coordination plan and complete ADR text where required, then wait for explicit approval before performing those mutations.

- P-034 — Create two architectural decisions before integration
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Record StructuralRef identity and initial iframe exclusion as two separate canonical ADRs before the WebMCP integration slice. Repository policy still requires the complete proposed text of each ADR to be shown and explicitly approved before writing it.

- P-035 — Add Structural Ref glossary wording
  - Origin: Agent
  - Area: A-004
  - Status: Open
  - Content: Add a canonical `Structural Ref` term to `CONTEXT.md` after its exact wording is proposed and explicitly approved. No wording has been approved yet.

- P-036 — Reject one monolithic delivery
  - Origin: User
  - Area: A-004
  - Status: Rejected
  - Content: Do not bundle fork changes, runtime extraction, StructuralTree porting, POM correlation, synthetic refs, iframe behavior, action addressing, and highlighting into one task or pull request.

- P-037 — Defer moving the Playwright fork
  - Origin: User
  - Area: A-005
  - Status: Accepted
  - Content: Continue using the existing `enekesabel/playwright` fork for now. Moving it to the Ayme Labs organization is future governance work and must not block current capture experiments.

- P-038 — Track fork transfer in one Ayme issue
  - Origin: Agent
  - Area: A-005
  - Status: Open
  - Content: Open one canonical issue in `enekesabel/ayme`, linked to Ayme issues #173 and #65, for eventual transfer of the Playwright fork to Ayme Labs ownership. Do not duplicate the issue in ayme-webmcp. The user has not yet accepted the issue location or authorized issue creation.

- P-039 — Keep PR #11 as the integration pull request
  - Origin: Agent
  - Area: A-004
  - Status: Accepted
  - Content: Keep PR #11 as the Wave 2 `get_page_state` integration pull request. Do not fold the Playwright fork change, playwright-browser foundation, or StructuralTree kernel extraction into it.
  - Sources: Current conversation, prior recommendation.

- P-040 — Decorate POM roots only in the first integration
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: The first POM-aware `get_page_state` decorates registered Page Object roots only. Locator-member decoration and final member lookup are separate follow-up work. PR #9 remains sufficient for current member observation and tool availability behavior.
  - Sources: Current conversation, response annotation 2.

- P-041 — Lock the output contract with one representative example
  - Origin: User
  - Area: A-001
  - Status: Accepted
  - Content: Use an agent-facing StructuralTree format close to the Ayme live POM experiment. Agree on one representative output example before implementation and use that example as the first serialized-output contract.
  - Sources: Current conversation, response annotation 1.

- P-042 — Base local integration work on PR #9
  - Origin: User
  - Area: A-004
  - Status: Superseded
  - Content: Start the local integration branch from the current tip of PR #9 when that dependency makes the work clearer. Do not rewrite or push PR #11 merely to establish the local base.
  - Sources: Current conversation, user request.

- P-043 — Maintain the DevFlow context in the worktree
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Copy PR #11's exact `.scratch/context.md` into the active worktree and keep it updated as the local durable DevFlow context instead of relying on agent memory alone.
  - Sources: Current conversation, user request.

- P-044 — Keep external Playwright ref actions outside the first slice
  - Origin: Agent
  - Area: A-003
  - Status: Accepted
  - Content: Treat StructuralRefs in the first WebMCP integration as capture identity and agent-visible evidence only. Existing POM tools continue to invoke live POM methods directly. Driving an external Playwright session through `aria-ref` selectors remains follow-up work, so the first browser-side capture stays in the top-level main realm.
  - Sources: Current conversation, response annotation 3 and agent clarification.

- P-045 — Keep the capture result semantic contract internal
  - Origin: Agent
  - Area: A-002
  - Status: Accepted
  - Content: The internal Playwright capture operation must provide one distilled view, one undistilled full view, and the same capture's `Element` to ref correlation. Exact TypeScript method and field names are implementation details unless another package consumer requires a stable exported contract.
  - Sources: Current conversation, response annotation 4 and agent clarification.

- P-046 — Align complete StructuralRef and iframe ADR text before writing
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Review the complete proposed StructuralRef identity ADR and the separate top-level-document and iframe-exclusion ADR in conversation. Write neither ADR until the user explicitly approves its complete text.
  - Sources: Current conversation, response annotation 5.

- P-047 — Use compact root-only POM annotations
  - Origin: Agent
  - Area: A-001
  - Status: Open
  - Content: Render the current StructuralTree with the Ayme experiment's ref-first compact syntax. Add `/pom: <registration-id>.<component-path>` only to nodes matched by explicit nested Page Object root locators. Do not attach a top-level Page Object without a root locator to an arbitrary document node, and do not emit locator-member annotations.
  - Sources: Current conversation, proposed representative output example.

- P-048 — Adopt the proposed capture-scoped Structural Ref ADR
  - Origin: Agent
  - Area: A-001
  - Status: Outdated
  - Content: Accept the complete proposed ADR that uses Playwright refs as capture-scoped StructuralNode identity, keeps full and distilled views in one ref namespace, treats POM data as enrichment, and restricts synthetic refs to eligible observable roots without making them Playwright action handles.
  - Sources: Current conversation, proposed Structural Ref ADR text.

- P-049 — Adopt the proposed top-level-document ADR
  - Origin: Agent
  - Area: A-003
  - Status: Outdated
  - Content: Accept the complete proposed ADR that captures the active top-level document in the main realm, may retain the iframe element itself, excludes child-frame contents and cross-frame POM correlation, and defers per-frame composition.
  - Sources: Current conversation, proposed iframe ADR text.

- P-050 — Add the proposed Structural Ref glossary definition
  - Origin: Agent
  - Area: A-004
  - Status: Open
  - Content: Define a Structural Ref as a capture-scoped identifier used by `get_page_state` to name one observed structural node. A real Structural Ref comes from Playwright's ARIA capture; a synthetic Structural Ref names an eligible omitted node and is not a Playwright action handle.
  - Sources: Current conversation, proposed glossary wording.

- P-051 — Keep ADRs limited to durable decisions
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Keep the two ADRs short. Record only durable architectural choices and their reason. Leave current pull-request scope, package mechanics, operation names, tests, and follow-up work in DevFlow context or implementation planning.
  - Sources: Current conversation, user request invoking Ask Matt and Ponytail.

- P-052 — Use the concise Structural Ref ADR
  - Origin: Agent
  - Area: A-001
  - Status: Accepted
  - Content: Record in one paragraph that Structural Refs are capture-scoped, real refs come from one shared Playwright capture, eligible omitted POM roots may receive synthetic refs, synthetic refs are not Playwright action handles, and cross-capture reconciliation is deferred.
  - Sources: Current conversation, concise ADR proposal.

- P-053 — Use the concise iframe ADR
  - Origin: Agent
  - Area: A-003
  - Status: Accepted
  - Content: Record in one paragraph that the initial StructuralTree covers only the top-level document, may retain iframe elements, excludes child-frame contents and cross-frame POM roots, and defers frame composition to a later decision.
  - Sources: Current conversation, concise ADR proposal.

- P-054 — Name the internal capture operation directly
  - Origin: Agent
  - Area: A-002
  - Status: Accepted
  - Content: Name the internal operation `captureAriaSnapshot` and its three relevant results `distilledText`, `fullText`, and `refsByElement`. Keep the operation private to the browser compatibility boundary.
  - Sources: Current conversation, request for obvious and clear names.

- P-055 — Coordinate implementation through Grove-backed Codex tasks
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Use Codex Coordinator for separate user-visible tasks, Grove work records and packets for execution state, and the Implement flow for test-driven delivery, review, and commits.
  - Sources: Current conversation, user request.

- P-056 — Execute the three-wave task plan
  - Origin: Agent
  - Area: A-004
  - Status: Accepted
  - Content: Run the Playwright capture change and StructuralTree kernel extraction in the first wave, the playwright-browser foundation after the fork contract exists, and the root-only `get_page_state` integration in PR #11 after both WebMCP foundations exist. Stop for a user checkpoint after each wave.
  - Sources: Current conversation, coordinator plan proposal.

- P-057 — Keep one coordinator-owned integration branch
  - Origin: Agent
  - Area: A-004
  - Status: Superseded
  - Content: Keep `codex/pom-structural-state` based on PR #9 as the coordinator and eventual PR #11 integration branch. Give each prerequisite implementation its own worktree and branch. The coordinator owns final review, Grove reconciliation, pushing, and pull-request creation; implementation tasks commit but do not push or open pull requests.
  - Sources: Current conversation, coordinator plan proposal.

- P-058 — Rebase the coordinator branch onto current main
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Rebase `codex/pom-structural-state` onto current `main` before implementation. Current `main` already contains merged PR #9, so it replaces the earlier PR #9 tip as the integration baseline.
  - Sources: Current conversation, implementation authorization.
  - Supersedes: P-042

- P-059 — Keep coordinator ownership on the rebased integration branch
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Keep the rebased `codex/pom-structural-state` branch as the coordinator-owned integration branch for PR #11. Give prerequisite implementations isolated tasks and checkouts. The coordinator owns Grove state, review, reconciliation, pushes, pull-request updates, and CI follow-through.
  - Sources: Current conversation, approved coordinator distribution and implementation authorization.
  - Supersedes: P-057

- P-060 — Finish with a green integration pull request
  - Origin: User
  - Area: A-004
  - Status: Accepted
  - Content: Continue through implementation, review, pull-request delivery, and CI follow-through. Completion requires the integration pull request to be open with all required checks passing.
  - Sources: Current conversation, implementation authorization.
