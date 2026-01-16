import path from "path";
import os from "os";
import fs from "fs";
import { mapOSToJavaBinary } from "../install/architecture.js";
import { TSA_NAME } from "./constants.js";

export const BUILD_DIR = path.join(process.cwd(), "build");

export const findTSAHomeDirectory = (): string => {
  const tsaDir = path.join(os.homedir(), ".tsa");
  if (!fs.existsSync(tsaDir)) {
    fs.mkdirSync(tsaDir, { recursive: true });
  }
  return tsaDir;
};

export const findTSAProjectDirectory = (): string => {
  const tsaDir = path.join(process.cwd(), "tsa");
  if (!fs.existsSync(tsaDir)) {
    fs.mkdirSync(tsaDir, { recursive: true });
  }
  return tsaDir;
};

export const findCompiledContract = (name: string): string => {
  return path.join(BUILD_DIR, name + ".compiled.json");
};

export const findJavaBinPath = (): string | null => {
  const tsaHome = findTSAHomeDirectory();
  const jre = path.join(tsaHome, "jre");

  if (!fs.existsSync(jre)) {
    return null;
  }

  const contents = fs.readdirSync(jre);

  // Return null if directory is empty
  if (contents.length === 0) {
    return null;
  }

  // If exactly one item, use it as the jre path
  if (contents.length != 1) {
    throw new Error(`Unexpected content in JRE directory: expected empty or single directory, found ${contents.length} items`);
  }

  const javaHomePath = path.join(jre, contents[0]);
  const binPath = path.join(javaHomePath, "bin");
  const javaBinPath = path.join(binPath, mapOSToJavaBinary());

  if (!fs.existsSync(javaBinPath)) {
    return null;
  }

  return javaBinPath;
};

export const findTsaPath = (): string | null => {
  const tsaHome = findTSAHomeDirectory();
  const result = path.join(tsaHome, TSA_NAME);

  if (!fs.existsSync(result)) {
    return null;
  }

  return result;
};

export const getCheckerPath = (checkerName: string): string => {
  return path.join(path.dirname(new URL(import.meta.url).pathname), "../../src/checkers", checkerName);
};
