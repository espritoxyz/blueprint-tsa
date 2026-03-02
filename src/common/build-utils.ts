import { UIProvider, buildAll } from "@ton/blueprint";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { compileFunc } from "@ton-community/func-js";
import { Sym } from "./constants.js";

export const buildAllContracts = async (ui: UIProvider) => {
  ui.setActionPrompt(`${Sym.WAIT} Compiling contracts...`);
  try {
    await buildAll(ui);
  } catch (e) {
    ui.clearActionPrompt();
    ui.write((e as any).toString());
    ui.write(`\n${Sym.ERR} Failed to compile one of the files`);
    ui.write(
      "Please make sure you can run `blueprint build --all` successfully before running TSA.",
    );
    process.exit(1);
  }
  ui.clearActionPrompt();
  ui.write(`${Sym.OK} Compiled.\n`);
};

const loadFuncSources = (
  filePath: string,
  baseDir: string,
  loaded: Set<string> = new Set(),
): Record<string, string> => {
  const sources: Record<string, string> = {};
  const absolutePath = path.resolve(baseDir, filePath);
  const normalizedPath = path.normalize(absolutePath);

  if (loaded.has(normalizedPath)) {
    return sources;
  }

  loaded.add(normalizedPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, "utf-8");
  const relativeKey = path
    .relative(baseDir, absolutePath)
    .split(path.sep)
    .join("/");
  sources[relativeKey] = content;

  // Parse #include statements
  const includeRegex = /#include\s+["<]([^"<>]+)["<]/g;
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    const importPath = match[1];
    const importDir = path.dirname(absolutePath);
    const importedSources = loadFuncSources(importPath, importDir, loaded);
    Object.assign(sources, importedSources);
  }

  return sources;
};

export const compileFuncFileToBase64Boc = async (
  filePath: string,
  fileName: string,
): Promise<string> => {
  const fileDir = path.dirname(filePath);
  const sources = loadFuncSources(fileName, fileDir);

  const compilationResult = await compileFunc({
    targets: [fileName],
    sources,
  });

  if (compilationResult.status === "error") {
    throw new Error(`FunC compilation error: ${compilationResult.message}`);
  }

  return compilationResult.codeBoc;
};
