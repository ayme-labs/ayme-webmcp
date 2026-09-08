import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __AYME_WEBMCP_PUBLISH__: "true",
  },
  plugins: [vue()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    exclude: ["tests/**"],
  },
});
