# ayme-webmcp

## Playwright settings

The Vite plugin accepts the small part of Playwright configuration that the
Ayme browser adapter uses:

```ts
aymeWebMcp({
  playwright: {
    config: "./playwright.config.ts",
    project: "chromium",
    use: {
      testIdAttribute: "data-testid",
      actionTimeout: 10_000,
      navigationTimeout: 30_000,
    },
  },
});
```

`config` is optional. When it is omitted, Ayme does not search for a
Playwright config and does not import Playwright's config loader. The supported
values come from the explicit `use` overrides and the adapter defaults.
Relative config paths resolve against Vite's root. Absolute paths work too.
Consumers that relied on the old automatic discovery must now pass their
config path explicitly.

If a config is supplied, Ayme loads the consumer's Playwright 1.62.x config
loader. That loader is a private Playwright module, so other versions and
loader shapes fail with an explicit compatibility error. Ayme reads only
`testIdAttribute`, `actionTimeout`, and `navigationTimeout`; no other config
field enters the browser bundle.

Without `project`, a config with no projects uses its top-level `use` values, a
single project is selected automatically, and multiple projects must agree on
all three supported values. If they do not, set `project` to a project name.
That name must identify exactly one project.

Each supported field resolves independently. Explicit `use` overrides win over
the selected project, then the top-level config, then the adapter runtime
default. The adapter defaults are 1,000 ms for actions and 30,000 ms for
navigation. An `undefined` value does not erase an inherited value. Action and
navigation defaults are applied to the page returned by `createPage`, which is
the page used by POM and ref actions. Per-call timeout options and later
`setDefaultTimeout` or `setDefaultNavigationTimeout` calls still win, and `0`
means no timeout. If navigation has no separate value, it inherits the general
action timeout.

The adapter supports same-document navigation and full-document navigation via
`page.goto`. A full-document navigation replaces the controlled document and
ends the current browser execution; it does not return a destination page to
the old execution.
