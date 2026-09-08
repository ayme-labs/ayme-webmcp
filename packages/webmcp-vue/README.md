# @ayme-dev/webmcp-vue

Vue 3 integration for Ayme runtime ownership and Page Object registration.

## Install and configure

```sh
npm install @ayme-dev/webmcp @ayme-dev/webmcp-vue
npm install -D @ayme-dev/unplugin-webmcp @playwright/test@~1.62.1
```

Packages are not published yet; use supplied tarballs before release.
Configure the [Vite plugin](https://github.com/ayme-labs/ayme-webmcp/blob/main/packages/unplugin-webmcp/README.md)
alongside `@vitejs/plugin-vue`, and annotate your POM as shown in the
[core README](https://github.com/ayme-labs/ayme-webmcp/blob/main/packages/webmcp/README.md).

## Own the runtime at the application root

In the root component's setup, before registering POMs:

```vue
<script setup lang="ts">
import { useAymeWebMcp, usePageObject } from "@ayme-dev/webmcp-vue";
import { GreetingPage } from "./GreetingPage";

const { publicationStatus, retryPublication } = useAymeWebMcp();
usePageObject(GreetingPage);
</script>
```

Call `useAymeWebMcp()` once per application document. It owns runtime startup,
publication, and cleanup on Vue scope disposal. Register each root POM with
`usePageObject` in the component that owns its lifetime. Child POMs in compiled
member metadata are discovered recursively; action return values do not
register independent roots.

`publicationStatus.value.state` reports `disabled`, `waiting`, `active`,
`unavailable`, `failed`, or `disposed`. `disabled` means the build's `publish`
option is off. `unavailable` means the browser driver did not arrive within the
initial wait. Load the driver before root setup, or call `retryPublication()`
after it becomes available. The runtime and page-state API still work without
a driver. No manual observer or synchronization loop is needed.

For Chrome or a coding agent connection, follow the skill's
[browser setup reference](https://github.com/ayme-labs/ayme-webmcp/blob/main/skills/ayme/references/browser-setup.md).

## Coding agent skill

> Install the `ayme` skill from https://github.com/ayme-labs/ayme-webmcp/tree/main/skills/ayme into this project's skill directory, including its references. Then use it to set up Ayme WebMCP here.
