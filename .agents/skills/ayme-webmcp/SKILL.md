---
name: ayme-webmcp
description: Build, expose, and troubleshoot user-flow page object models with Ayme WebMCP.
---

# Ayme WebMCP

Use this skill when working on page object models (POMs), Vue registrations,
browser WebMCP publication, or tool-visible page state.

1. Read the repository's `CONTEXT.md` and relevant ADRs before changing the
   runtime or public package contracts.
2. For POM design, read [Page object design](references/page-object-design.md).
   Establish the interaction scope, locator members, action returns, and
   ownership before settling on implementation details.
3. For initialization, registration, or tool exposure, read
   [Ayme integration](references/ayme-integration.md). Verify the APIs against
   the installed package version, especially when an example uses an internal
   entry point.
4. Keep POM registration, browser WebMCP publication, direct Ayme consumers,
   and assistant adapters as separate responsibilities. Reuse the existing
   lifecycle rather than introducing a second observation or synchronization
   loop.
5. Keep imported POMs browser-safe: do not pull test runners or Node-only
   modules into code that is compiled into the application bundle.
6. Validate the requested slice in proportion to its scope. Distinguish source
   inspection and automated tests from behavior that still needs manual browser
   verification, and report unresolved compatibility assumptions explicitly.
