<script setup lang="ts">
import { useAymeExperiment } from "./ayme/useAymeExperiment";
import DebugPanel from "./debug/DebugPanel.vue";
import ListDemo from "./demo/ListDemo.vue";

const {
  pageState,
  pageStateCapturedAt,
  pageStateError,
  pageStateLoading,
  applicationModelSelectionPath,
  refreshPageState,
  refreshPomMembers,
  registeredPoms,
  resetTrace,
  trace,
  webMcpStatus,
  previewApplicationModelTarget,
  clearApplicationModelPreview,
  pinApplicationModelTarget,
} = useAymeExperiment();
</script>

<template>
  <div class="app-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Ayme browser experiment</p>
        <h1>List app + WebMCP inspector</h1>
        <p class="page-intro">
          Operate the list directly on the left, or invoke the same generated
          POM tools from the debug console on the right. Hover an application
          model member to preview its live element, or click to select it.
        </p>
      </div>
      <span class="runtime-badge">DOM-backed browser runtime</span>
    </header>

    <main class="app-layout">
      <ListDemo />
      <DebugPanel
        :page-state="pageState"
        :page-state-captured-at="pageStateCapturedAt"
        :page-state-error="pageStateError"
        :page-state-loading="pageStateLoading"
        :application-model-selection-path="applicationModelSelectionPath"
        :refresh-page-state="refreshPageState"
        :registered-poms="registeredPoms"
        :refresh-pom-members="refreshPomMembers"
        :reset-trace="resetTrace"
        :trace="trace"
        :web-mcp-status="webMcpStatus"
        :preview-application-model-target="previewApplicationModelTarget"
        :clear-application-model-preview="clearApplicationModelPreview"
        :pin-application-model-target="pinApplicationModelTarget"
      />
    </main>
  </div>
</template>
