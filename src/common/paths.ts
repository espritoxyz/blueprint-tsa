import path from "path";
import os from "os";
import fs from "fs";

export const BUILD_DIR = path.join(process.cwd(), "build");

export const findTSAHomeDirectory = (): string => {
  const tsaDir = path.join(os.homedir(), ".tsa");
  if (!fs.existsSync(tsaDir)) {
    fs.mkdirSync(tsaDir, { recursive: true });
  }
  return tsaDir;
};

export const findCompiledContract = (name: string): string => {
  return path.join(BUILD_DIR, name + ".compiled.json");
};
