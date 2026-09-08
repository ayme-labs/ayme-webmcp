import { computed, ref } from "vue";
import { createPage } from "@ayme-dev/playwright-browser";
import { withDemoFeedback, type TraceEntry } from "./withDemoFeedback";

export function useDemoTrace() {
  const revision = ref(0);
  const entries = ref<TraceEntry[]>([]);
  const page = withDemoFeedback(createPage(), {
    onTrace(entry) {
      entries.value.push(entry);
      revision.value += 1;
    },
    beforeActionMs: 500,
    clickCue: true,
  });
  // The demo explicitly types characters through standard Playwright methods.
  page.setDefaultTimeout(10_000);

  return {
    page,
    trace: computed(() => {
      void revision.value;
      return entries.value;
    }),
    resetTrace() {
      entries.value.splice(0);
      revision.value += 1;
    },
  };
}
