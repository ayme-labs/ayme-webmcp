import path from "node:path";

import ts from "typescript";

export type PomCompilerOptions = {
  tsconfigPath?: string;
};

type PomProgramOptions = {
  fallbackToUnconfigured?: boolean;
};

export function createPomProgram(
  fileName: string,
  options: PomCompilerOptions = {},
  { fallbackToUnconfigured = false }: PomProgramOptions = {}
) {
  const absoluteFileName = path.resolve(fileName);

  let config: ts.ParsedCommandLine;
  try {
    config = projectConfigFor(
      absoluteFileName,
      options,
      fallbackToUnconfigured
    );
  } catch (error) {
    if (!fallbackToUnconfigured) throw error;
    return ts.createProgram([absoluteFileName], {});
  }

  return ts.createProgram({
    rootNames: [...new Set([...config.fileNames, absoluteFileName])],
    options: {
      ...config.options,
      noEmit: true,
    },
  });
}

function projectConfigFor(
  fileName: string,
  options: PomCompilerOptions,
  allowConfigErrors: boolean
): ts.ParsedCommandLine {
  const configPath = options.tsconfigPath
    ? path.resolve(options.tsconfigPath)
    : ts.findConfigFile(
        path.dirname(fileName),
        ts.sys.fileExists,
        "tsconfig.json"
      );
  if (!configPath)
    throw new Error(
      `Could not find a tsconfig.json for POM source ${fileName}.`
    );

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw configError(configPath, configFile.error);

  const config = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );
  const error = config.errors[0];
  if (error && !allowConfigErrors) throw configError(configPath, error);
  return config;
}

function configError(configPath: string, diagnostic: ts.Diagnostic) {
  return new Error(
    `Could not read TypeScript project configuration ${configPath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
  );
}
