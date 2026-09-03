import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { createPage, type TraceEntry } from "@ayme-dev/playwright-browser";
import type { RegisteredPom } from "@ayme-dev/webmcp/internal";
import {
  configureAymeRuntime,
  capturePageState,
  getPageStateForElements,
  listRegisteredPomTargets,
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
  const pageState = ref<string>();
  const pageStateCapturedAt = ref<string>();
  const pageStateError = ref<string>();
  const pageStateLoading = ref(false);
  const applicationModelSelectionPath = ref<string>();

  const traceEntries = ref<TraceEntry[]>([]);
  const page = createPage({
    onTrace(entry) {
      traceEntries.value.push(entry);
      traceRevision.value += 1;
    },
    pacing: {
      beforeActionMs: 500,
      clickCue: true,
      typingIntervalMs: 60,
    },
  });

  configureAymeRuntime(page);
  usePageObject(ListPage);

  const trace = computed(() => {
    void traceRevision.value;
    return traceEntries.value;
  });

  const refreshPomMembers = () => probeRegisteredPomMembers();

  let pageStateRequestId = 0;
  let unsubscribeFromRegisteredPoms: (() => void) | undefined;
  let disposeWebMcpTools: (() => void) | undefined;
  let highlightObserver: MutationObserver | undefined;
  let highlightRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightedElements: Element[] = [];
  let highlightRequestId = 0;
  let selectedApplicationModelPath: string | undefined;
  let hoveredApplicationModelPath: string | undefined;
  let unmounted = false;

  const clearHighlightedElements = () => {
    for (const element of highlightedElements)
      element.removeAttribute("data-ayme-highlight");
    highlightedElements = [];
  };

  const applyApplicationModelHighlight = async (path: string | undefined) => {
    const requestId = ++highlightRequestId;
    clearHighlightedElements();

    if (!path) return;

    try {
      const targets = (await listRegisteredPomTargets()).filter(
        (target) => target.path === path
      );
      const targetElements = uniqueElements(
        targets.map((target) => target.element)
      );
      const { state, refs: targetRefs } =
        await getPageStateForElements(targetElements);
      const refs = targetRefs.filter((ref): ref is string => ref !== undefined);
      const resolutions = await state.resolve(...refs);
      const elements = uniqueElements(
        resolutions.flatMap((resolution) =>
          resolution.status === "resolved" ? [resolution.node.element] : []
        )
      );
      if (unmounted || requestId !== highlightRequestId) return;

      for (const element of elements)
        element.setAttribute("data-ayme-highlight", "");
      highlightedElements = elements;
    } catch (error) {
      if (unmounted || requestId !== highlightRequestId) return;
      console.warn(`Could not highlight ${path}: ${errorMessage(error)}`);
    }
  };

  const previewApplicationModelTarget = (path: string) => {
    hoveredApplicationModelPath = path;
    void applyApplicationModelHighlight(
      hoveredApplicationModelPath ?? selectedApplicationModelPath
    );
  };

  const clearApplicationModelPreview = () => {
    hoveredApplicationModelPath = undefined;
    void applyApplicationModelHighlight(selectedApplicationModelPath);
  };

  const pinApplicationModelTarget = (path: string) => {
    selectedApplicationModelPath =
      selectedApplicationModelPath === path ? undefined : path;
    applicationModelSelectionPath.value = selectedApplicationModelPath;
    void applyApplicationModelHighlight(
      hoveredApplicationModelPath ?? selectedApplicationModelPath
    );
  };

  const schedulePinnedHighlightRefresh = (records?: MutationRecord[]) => {
    if (
      records?.length &&
      records.every(
        (record) =>
          record.type === "attributes" &&
          record.attributeName === "data-ayme-highlight"
      )
    )
      return;
    if (
      !selectedApplicationModelPath ||
      hoveredApplicationModelPath ||
      highlightRefreshTimer !== undefined
    )
      return;
    highlightRefreshTimer = setTimeout(() => {
      highlightRefreshTimer = undefined;
      if (selectedApplicationModelPath)
        void applyApplicationModelHighlight(selectedApplicationModelPath);
    }, 40);
  };

  const refreshPageState = async () => {
    const requestId = ++pageStateRequestId;
    pageStateLoading.value = true;
    pageStateError.value = undefined;

    try {
      const demoRoot = document.querySelector(
        '[aria-label="Demo application"]'
      );
      const snapshot = await capturePageState(demoRoot ?? document.body);
      if (unmounted || requestId !== pageStateRequestId) return;
      pageState.value = snapshot;
      pageStateCapturedAt.value = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (error) {
      if (unmounted || requestId !== pageStateRequestId) return;
      pageStateError.value = errorMessage(error);
    } finally {
      if (!unmounted && requestId === pageStateRequestId)
        pageStateLoading.value = false;
    }
  };

  onMounted(async () => {
    highlightObserver = new MutationObserver(schedulePinnedHighlightRefresh);
    highlightObserver.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    const updateRegisteredPoms = () => {
      registeredPoms.value = listRegisteredPoms();
      void refreshPageState();
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
    highlightObserver?.disconnect();
    if (highlightRefreshTimer !== undefined)
      clearTimeout(highlightRefreshTimer);
    clearHighlightedElements();
    disposeWebMcpTools?.();
    unsubscribeFromRegisteredPoms?.();
  });

  return {
    pageState,
    pageStateCapturedAt,
    pageStateError,
    pageStateLoading,
    applicationModelSelectionPath,
    refreshPageState,
    registeredPoms,
    refreshPomMembers,
    resetTrace() {
      traceEntries.value.splice(0);
      traceRevision.value += 1;
    },
    trace,
    webMcpStatus,
    previewApplicationModelTarget,
    clearApplicationModelPreview,
    pinApplicationModelTarget,
  };
}

function uniqueElements(elements: readonly Element[]) {
  return [...new Set(elements)];
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
