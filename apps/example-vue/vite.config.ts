import vue from "@vitejs/plugin-vue";
import { aymeWebMcp } from "@ayme-dev/unplugin-webmcp/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), aymeWebMcp()],
  server: {
    host: "127.0.0.1",
    port: 4190,
    strictPort: true,
  },
});
