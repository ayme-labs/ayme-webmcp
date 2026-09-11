import {
  createPomCompiler,
  type PomCompilerOptions,
} from "./derivePomManifests";
import { rewritePomImports } from "./rewritePomImports";

/** The source transform shared by Vite and the experimental Turbopack loader. */
export function createPomTransform(options: PomCompilerOptions = {}) {
  const compiler = createPomCompiler(options);

  return (code: string, id: string) => {
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
  };
}
