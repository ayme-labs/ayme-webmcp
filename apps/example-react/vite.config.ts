import react from "@vitejs/plugin-react";
import { aymeWebMcp } from "@ayme-dev/unplugin-webmcp/vite";
import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  plugins: [react(), aymeWebMcp({ publish: mode !== "publication-disabled" })],
}));
