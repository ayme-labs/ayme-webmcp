import { computed, ref } from "vue";
import { createPage, type TraceEntry } from "@ayme-dev/playwright-browser";

export function useDemoTrace() {
  const revision = ref(0);
  const entries = ref<TraceEntry[]>([]);
  const page = createPage({
    onTrace(entry) {
      entries.value.push(entry);
      revision.value += 1;
    },
    pacing: { beforeActionMs: 500, clickCue: true, typingIntervalMs: 60 },
  });
  // Demo pacing takes longer than the adapter's normal action budget.
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
