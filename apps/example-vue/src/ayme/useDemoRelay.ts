import { computed, ref, watch, type Ref } from "vue";
import type { AymeWebMcpPublicationStatus } from "@ayme-dev/webmcp-vue";

export function useDemoRelay(
  status: Readonly<Ref<AymeWebMcpPublicationStatus>>
) {
  const relayError = ref<string>();
  watch(
    () => status.value.state,
    async (state) => {
      if (state !== "active" || window.__AYME_DISABLE_RELAY__) return;
      try {
        await loadRelayEmbed();
      } catch (error) {
        relayError.value =
          error instanceof Error ? error.message : String(error);
      }
    }
  );
  return computed(() =>
    relayError.value
      ? `${status.value.message} Local relay unavailable: ${relayError.value}`
      : status.value.message
  );
}

async function loadRelayEmbed() {
  if (document.querySelector("script[data-ayme-relay]")) return;
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
