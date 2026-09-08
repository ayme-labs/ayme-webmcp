# Ayme integration

## Prepare the POM

Follow [Page object design](page-object-design.md) for interaction scopes,
annotations, members, and action returns.

Use the installed compiler integration and decorator configuration. POMs
imported into the browser must not depend on test runners or Node-only modules.

## Register root POMs in Vue

Call `usePageObject` in the Vue component that owns the POM:

```ts
import { usePageObject } from "@ayme-dev/webmcp-vue";
import { MyPage } from "./MyPage";

usePageObject(MyPage);
```

Register page POMs and independent global components in their owning Vue
components. Registration is disposed with the Vue scope.

Child POMs exposed through a registered POM's compiled member metadata are
discovered recursively. They do not need separate root registration. An
unrelated annotated component or a POM returned from an action is not
registered automatically.

## Reuse the current application lifecycle

When adding a POM to an integrated application, reuse its existing runtime
initialization and WebMCP publisher. A typical lifecycle:

1. Create and configure the browser runtime before registering POMs.
2. Wait for the browser WebMCP driver and start tool synchronization on mount.
3. Dispose synchronization on unmount, including when asynchronous startup
   finishes after disposal.

The example application is a useful reference for this lifecycle. Its tracing,
highlighting, and relay loading are example features, not required setup.
Verify whether an entry point is public before adopting an `/internal` API;
keep temporary internal wiring at the application boundary.

Before changing the lifecycle, locate the existing observation and registration
loops so a second loop is not introduced.

## Separate publication from direct consumers

POM registration, browser WebMCP publication, direct Ayme calls, and assistant
adapters are separate responsibilities:

- POM registration makes live definitions available to Ayme.
- Browser publication exposes those tools through a native WebMCP
  implementation or a compatible polyfill.
- Direct consumers can call Ayme APIs without browser WebMCP publication.
- An assistant adapter may mirror browser tools into its own tool registry; it
  should not become a second source of POM registration or page observation.

Keep the native/polyfill boundary explicit and verify the installed WebMCP
contract before relying on optional methods such as `executeTool`.

## Optional quick verification

After mounting the component, inspect page state when the runtime exposes it:

```ts
import { ayme } from "@ayme-dev/webmcp";

console.log((await ayme.getPageState()).text);
```

Confirm that the intended POM and its visible members appear. This checks page
state discovery, not whether a browser WebMCP client can invoke the tools.
