import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { RegisteredPom } from "@ayme-dev/webmcp/internal";
import {
  createBrowserPage,
  configureAymeRuntime,
  createPageRegistration,
  listRegisteredPoms,
  probeRegisteredPomMembers,
  registerWebMcpTools,
  subscribeToRegisteredPoms,
} from "@ayme-dev/webmcp/internal";
import { ListPage } from "../../playwright/pom/ListPage";

export function useAymeExperiment() {
  const traceRevision = ref(0);
  const webMcpStatus = ref("Waiting to register WebMCP tools…");
  const registeredPoms = ref<RegisteredPom[]>([]);
  let demoMutationObserver: MutationObserver | undefined;
  let probeTimer: number | undefined;
  let probeScheduled = false;

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
  const listPageRegistration = createPageRegistration(ListPage);

  const trace = computed(() => {
    void traceRevision.value;
    return browserRuntime.trace;
  });

  const refreshPomMembers = () => probeRegisteredPomMembers();

  const schedulePomMemberProbe = () => {
    if (probeScheduled) return;
    probeScheduled = true;
    probeTimer = window.setTimeout(() => {
      probeScheduled = false;
      probeTimer = undefined;
      void refreshPomMembers();
    }, 0);
  };

  let unsubscribeFromRegisteredPoms: (() => void) | undefined;

  onMounted(async () => {
    const updateRegisteredPoms = () => {
      registeredPoms.value = listRegisteredPoms();
    };
    updateRegisteredPoms();
    unsubscribeFromRegisteredPoms =
      subscribeToRegisteredPoms(updateRegisteredPoms);

    const demoPanel = document.querySelector(".demo-panel");
    if (demoPanel) {
      demoMutationObserver = new MutationObserver(schedulePomMemberProbe);
      demoMutationObserver.observe(demoPanel, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
    await refreshPomMembers();

    const registration = await registerWebMcpTools();
    webMcpStatus.value = registration.registered
      ? registration.message
      : `${registration.message} Debug console remains available.`;

    if (registration.registered && !window.__AYME_DISABLE_RELAY__) {
      try {
        await loadRelayEmbed();
      } catch (error) {
        webMcpStatus.value = `${registration.message} Local relay unavailable: ${errorMessage(error)}`;
      }
    }
  });

  onBeforeUnmount(() => {
    listPageRegistration.dispose();
    demoMutationObserver?.disconnect();
    if (probeTimer !== undefined) window.clearTimeout(probeTimer);
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
