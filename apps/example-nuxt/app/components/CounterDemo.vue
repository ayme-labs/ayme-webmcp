<script setup lang="ts">
import { onMounted, onScopeDispose, ref } from "vue";
import { useAymeWebMcp } from "@ayme-dev/webmcp-vue";
import {
  listRegisteredPoms,
  subscribeToRegisteredPoms,
} from "@ayme-dev/webmcp/internal";
import Counter from "./Counter.vue";

const visible = ref(true);
const { publicationStatus } = useAymeWebMcp();
const registrationCount = ref(0);
const metadata = ref("[]");
let unsubscribe: (() => void) | undefined;

function refreshRegistrations() {
  const registrations = listRegisteredPoms();
  registrationCount.value = registrations.length;
  metadata.value = JSON.stringify(
    registrations.flatMap(({ manifest }) => manifest.tools)
  );
}

// Keep the initial HTML identical; registry inspection is browser-only.
onMounted(() => {
  unsubscribe = subscribeToRegisteredPoms(refreshRegistrations);
  refreshRegistrations();
});
onScopeDispose(() => unsubscribe?.());
</script>

<template>
  <p role="status" aria-label="Publication">
    Publication: {{ publicationStatus.state }}
  </p>
  <button @click="visible = !visible">
    {{ visible ? "Unmount counter" : "Mount counter" }}
  </button>
  <Counter v-if="visible" />
  <p>
    Registered Page Objects:
    <span data-testid="registration-count">{{ registrationCount }}</span>
  </p>
  <pre data-testid="compiled-metadata">{{ metadata }}</pre>
</template>
