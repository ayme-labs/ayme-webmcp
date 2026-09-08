<script setup lang="ts">
import { useAymeWebMcp, usePageObject } from "@ayme-dev/webmcp-vue";
import { ListPage } from "../playwright/pom/ListPage";
import { useDemoTrace } from "./ayme/useDemoTrace";
import { useDemoRelay } from "./ayme/useDemoRelay";
import { useDemoInspector } from "./ayme/useDemoInspector";
import DebugPanel from "./debug/DebugPanel.vue";
import ListDemo from "./demo/ListDemo.vue";

// Ordinary apps call useAymeWebMcp() without options. This demo adds tracing and pacing.
const { page, trace, resetTrace } = useDemoTrace();
const { publicationStatus } = useAymeWebMcp({ page });
usePageObject(ListPage);

const webMcpStatus = useDemoRelay(publicationStatus);
const {
  pageState,
  pageStateCapturedAt,
  pageStateError,
  pageStateLoading,
  applicationModelSelectionPath,
  refreshPageState,
  refreshPomMembers,
  registeredPoms,
  previewApplicationModelTarget,
  clearApplicationModelPreview,
  pinApplicationModelTarget,
} = useDemoInspector();
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
