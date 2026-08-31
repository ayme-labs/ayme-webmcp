<script setup lang="ts">
import { useAymeExperiment } from "./ayme/useAymeExperiment";
import DebugPanel from "./debug/DebugPanel.vue";
import ListDemo from "./demo/ListDemo.vue";

const { refreshPomMembers, registeredPoms, resetTrace, trace, webMcpStatus } =
  useAymeExperiment();
</script>

<template>
  <div class="app-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Ayme browser experiment</p>
        <h1>List app + WebMCP inspector</h1>
        <p class="page-intro">
          Operate the list directly on the left, or invoke the same generated
          POM tools from the debug console on the right.
        </p>
      </div>
      <span class="runtime-badge">DOM-backed browser runtime</span>
    </header>

    <main class="app-layout">
      <ListDemo />
      <DebugPanel
        :registered-poms="registeredPoms"
        :refresh-pom-members="refreshPomMembers"
        :reset-trace="resetTrace"
        :trace="trace"
        :web-mcp-status="webMcpStatus"
      />
    </main>
  </div>
</template>
