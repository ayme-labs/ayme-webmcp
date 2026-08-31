import { createUnplugin, type UnpluginFactory } from "unplugin";

import {
  createPomCompiler,
  type PomCompilerOptions,
} from "./derivePomManifests";

export type AymeWebMcpOptions = PomCompilerOptions;

export const unpluginFactory: UnpluginFactory<AymeWebMcpOptions | undefined> = (
  options = {}
) => {
  const compiler = createPomCompiler(options);

  return {
    name: "ayme-webmcp",
    enforce: "pre",
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

        const registrations = manifests
          .map(
            (manifest) =>
              `registerCompiledPom(${manifest.className}, ${JSON.stringify(manifest)}, (page) => new ${manifest.className}(page));`
          )
          .join("\n");

        return {
          code: `import { registerCompiledPom } from '@ayme-dev/webmcp/internal';\n${code}\n${registrations}\n`,
          map: null,
        };
      },
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export { createPomCompiler, derivePomManifests } from "./derivePomManifests";
export type { PomCompiler, PomCompilerOptions } from "./derivePomManifests";
