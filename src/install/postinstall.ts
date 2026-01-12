import { findTSAHomeDirectory } from "../common/paths.js";
import { downloadTarWithJava, unpackTarGz } from "./java.js";
import path from "path";

/**
 * Postinstall script for blueprint-tsa
 * Runs after the package is installed
 */

const PAUSE_DURATION_MS = 10000;

const pause = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

async function main(): Promise<void> {
  const tsaHome = findTSAHomeDirectory();
  const archivePath = path.join(tsaHome, "jre.tar.gz");
  const jrePath = path.join(tsaHome, "jre")
  await downloadTarWithJava(archivePath);
  await unpackTarGz(archivePath, jrePath);
}

main();
