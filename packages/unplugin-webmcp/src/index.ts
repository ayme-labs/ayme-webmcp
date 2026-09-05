import { createUnplugin, type UnpluginFactory } from "unplugin";

import {
  createPomCompiler,
  type PomCompilerOptions,
} from "./derivePomManifests";
import { rewritePomImports } from "./rewritePomImports";

const PLAYWRIGHT_TEST_PACKAGE = "@playwright/test";

export type AymeWebMcpOptions = PomCompilerOptions;

export const unpluginFactory: UnpluginFactory<AymeWebMcpOptions | undefined> = (
  options = {}
) => {
  const compiler = createPomCompiler(options);

  return {
    name: "ayme-webmcp",
    enforce: "pre",
    vite: {
      config(config) {
        const exclude = config.optimizeDeps?.exclude ?? [];

        return {
          optimizeDeps: {
            ...config.optimizeDeps,
            exclude: [...new Set([...exclude, PLAYWRIGHT_TEST_PACKAGE])],
          },
        };
      },
    },
    transform: {
      filter: {
        id: /\.ts$/,
      },
      handler(code, id) {
        const fileName = id.split("?")[0];
        if (!fileName?.endsWith(".ts") || !code.includes("@WebMCP"))
          return null;

        const manifests = compiler.derivePomManifests(fileName);
        if (manifests.length === 0) return null;

        const rewrittenCode = rewritePomImports(code, fileName, options);

        const registrations = manifests
          .map(
            (manifest) =>
              `registerCompiledPom(${manifest.className}, ${JSON.stringify(manifest)});`
          )
          .join("\n");

        return {
          code: `import { registerCompiledPom } from '@ayme-dev/webmcp/internal';\n${rewrittenCode}\n${registrations}\n`,
          map: null,
        };
      },
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export { createPomCompiler, derivePomManifests } from "./derivePomManifests";
export type { PomCompiler, PomCompilerOptions } from "./derivePomManifests";
