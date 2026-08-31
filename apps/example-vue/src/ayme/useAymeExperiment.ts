import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { RegisteredPom } from "@ayme-dev/webmcp/internal";
import {
  createBrowserPage,
  configureAymeRuntime,
  listRegisteredPoms,
  probeRegisteredPomMembers,
  subscribeToRegisteredPoms,
  synchronizeWebMcpTools,
  waitForWebMcpDriver,
} from "@ayme-dev/webmcp/internal";
import { usePageObject } from "@ayme-dev/webmcp-vue";
import { ListPage } from "../../playwright/pom/ListPage";

export function useAymeExperiment() {
  const traceRevision = ref(0);
  const webMcpStatus = ref("Waiting to register WebMCP tools…");
  const registeredPoms = ref<RegisteredPom[]>([]);

  const browserRuntime = createBrowserPage({
    onTrace() {
      traceRevision.value += 1;
    },
    pacing: {
      beforeActionMs: 500,
      clickCue: true,
      typingIntervalMs: 60,
    },
  });

  configureAymeRuntime(browserRuntime.page);
  usePageObject(ListPage);

  const trace = computed(() => {
    void traceRevision.value;
    return browserRuntime.trace;
  });

  const refreshPomMembers = () => probeRegisteredPomMembers();

  let unsubscribeFromRegisteredPoms: (() => void) | undefined;
  let disposeWebMcpTools: (() => void) | undefined;
  let unmounted = false;

  onMounted(async () => {
    const updateRegisteredPoms = () => {
      registeredPoms.value = listRegisteredPoms();
    };
    updateRegisteredPoms();
    unsubscribeFromRegisteredPoms =
      subscribeToRegisteredPoms(updateRegisteredPoms);

    const driver = await waitForWebMcpDriver();
    if (!driver) {
      webMcpStatus.value =
        "document.modelContext is unavailable. Debug console remains available.";
      return;
    }

    const registration = await synchronizeWebMcpTools(driver);
    if (unmounted) {
      registration.dispose();
      return;
    }
    disposeWebMcpTools = registration.dispose;
    webMcpStatus.value = registration.message;

    if (!window.__AYME_DISABLE_RELAY__) {
      try {
        await loadRelayEmbed();
      } catch (error) {
        webMcpStatus.value = `${registration.message} Local relay unavailable: ${errorMessage(error)}`;
      }
    }
  });

  onBeforeUnmount(() => {
    unmounted = true;
    disposeWebMcpTools?.();
    unsubscribeFromRegisteredPoms?.();
  });

  return {
    registeredPoms,
    refreshPomMembers,
    resetTrace: browserRuntime.resetTrace,
    trace,
    webMcpStatus,
  };
}

async function loadRelayEmbed() {
  const existing = document.querySelector("script[data-ayme-relay]");
  if (existing) return;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.aymeRelay = "true";
    script.src =
      "https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Unable to load the local WebMCP relay."));
    document.head.append(script);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
