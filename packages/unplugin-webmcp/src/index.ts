import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createUnplugin, type UnpluginFactory } from "unplugin";

import {
  createPomCompiler,
  type PomCompilerOptions,
} from "./derivePomManifests";
import { rewritePomImports } from "./rewritePomImports";

const PLAYWRIGHT_TEST_PACKAGE = "@playwright/test";
const DEFAULT_TEST_ID_ATTRIBUTE = "data-testid";
const TEST_ID_ATTRIBUTE_DEFINE = "__AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__";
const PLAYWRIGHT_CONFIG_NAMES = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mts",
  "playwright.config.mjs",
  "playwright.config.cts",
  "playwright.config.cjs",
];

type LoadedPlaywrightConfig = {
  projects: Array<{ project: { use?: { testIdAttribute?: unknown } } }>;
};

type PlaywrightConfigLoader = {
  loadConfigFromFile(configFile: string): Promise<LoadedPlaywrightConfig>;
};

export type AymeWebMcpOptions = PomCompilerOptions;

export const unpluginFactory: UnpluginFactory<AymeWebMcpOptions | undefined> = (
  options = {}
) => {
  const compiler = createPomCompiler(options);

  return {
    name: "ayme-webmcp",
    enforce: "pre",
    vite: {
      async config(config) {
        const exclude = config.optimizeDeps?.exclude ?? [];
        const testIdAttribute = await testIdAttributeFor(config.root);

        return {
          define: {
            ...config.define,
            [TEST_ID_ATTRIBUTE_DEFINE]: JSON.stringify(testIdAttribute),
          },
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

async function testIdAttributeFor(root: string | undefined): Promise<string> {
  const configRoot = root ?? process.cwd();
  const configPath = PLAYWRIGHT_CONFIG_NAMES.map((name) =>
    resolve(configRoot, name)
  ).find(existsSync);
  if (!configPath) return DEFAULT_TEST_ID_ATTRIBUTE;

  const require = createRequire(resolve(configRoot, "package.json"));
  const playwrightTestPackagePath =
    require.resolve("@playwright/test/package.json");
  const playwrightTestRequire = createRequire(playwrightTestPackagePath);
  const playwrightPackagePath = playwrightTestRequire.resolve(
    "playwright/package.json"
  );
  const playwrightCommonPath = resolve(
    dirname(playwrightPackagePath),
    "lib/common/index.js"
  );
  const { configLoader } = (await import(
    pathToFileURL(playwrightCommonPath).href
  )) as { configLoader: PlaywrightConfigLoader };
  const config = await configLoader.loadConfigFromFile(configPath);
  const testIdAttribute = config.projects
    .map((project) => project.project.use?.testIdAttribute)
    .find((attribute): attribute is string => typeof attribute === "string");
  return testIdAttribute ?? DEFAULT_TEST_ID_ATTRIBUTE;
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export { createPomCompiler, derivePomManifests } from "./derivePomManifests";
export type { PomCompiler, PomCompilerOptions } from "./derivePomManifests";
