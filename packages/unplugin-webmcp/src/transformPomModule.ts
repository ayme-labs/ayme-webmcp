import {
  derivePomManifestsFromProgram,
  type PomCompilerOptions,
} from "./derivePomManifests";
import { createPomProgram, pomProgramDependencies } from "./pomProgram";
import { rewritePomImports } from "./rewritePomImports";

/** The source transform shared by Vite and the experimental Turbopack loader. */
export function createPomTransform(options: PomCompilerOptions = {}) {
  return (code: string, id: string) => {
    const fileName = id.split("?")[0];
    if (!fileName?.endsWith(".ts") || !code.includes("@WebMCP")) return null;

    const program = createPomProgram(fileName, options);
    const manifests = derivePomManifestsFromProgram(fileName, program);
    if (manifests.length === 0) return null;

    const dependencies = pomProgramDependencies(fileName, options);
    const rewrittenCode = rewritePomImports(code, fileName, options, program);
    const registrations = manifests
      .map(
        (manifest) =>
          `registerCompiledPom(${manifest.className}, ${JSON.stringify(manifest)});`
      )
      .join("\n");

    return {
      code: `import { registerCompiledPom } from '@ayme-dev/webmcp/internal';\n${rewrittenCode}\n${registrations}\n`,
      map: null,
      dependencies,
    };
  };
}
