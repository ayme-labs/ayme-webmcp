import vue from "@vitejs/plugin-vue";
import { aymeWebMcp } from "@ayme-dev/unplugin-webmcp/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), aymeWebMcp()],
  optimizeDeps: {
    // Let the POM transform remove the test-only barrel branch first.
    exclude: ["@playwright/test"],
  },
  server: {
    host: "127.0.0.1",
    port: 4190,
    strictPort: true,
  },
});
