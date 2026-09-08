import vue from "@vitejs/plugin-vue";
import { aymeWebMcp } from "@ayme-dev/unplugin-webmcp/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [vue(), aymeWebMcp({ publish: mode !== "publication-disabled" })],
  server: {
    host: "127.0.0.1",
    port: 4190,
    strictPort: true,
  },
}));
