import { adoptiumOS, adoptiumArch } from "./architecture.js";
import { findTSAHomeDirectory, findJavaBinPath } from "../common/paths.js";
import { downloadWithRedirect } from "./downloading.js";
import fs from "fs";
import path from "path";
import * as tar from "tar";

export const apiLink =
  `https://api.adoptium.net/v3/binary/latest/17/ga/${adoptiumOS}/${adoptiumArch}/jre/hotspot/normal/eclipse`;

export const downloadTarWithJava = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    downloadWithRedirect(apiLink, filePath).then(resolve).catch(reject);
  });
};

export const unpackTarGz = (archivePath: string, extractPath: string): Promise<void> => {
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(extractPath, { recursive: true });
  }
  return tar.extract({
    file: archivePath,
    cwd: extractPath,
  });
};

export const ensureJavaInstalled = async (): Promise<string> => {
  const javaPath = findJavaBinPath();
  if (javaPath != null) {
    return javaPath;
  }

  const tsaHome = findTSAHomeDirectory();
  const archivePath = path.join(tsaHome, "jre.tar.gz");
  const jrePath = path.join(tsaHome, "jre");
  await downloadTarWithJava(archivePath);
  await unpackTarGz(archivePath, jrePath);
  fs.unlinkSync(archivePath);

  const result = findJavaBinPath();
  if (result == null) {
    throw new Error("Java was not installed");
  }

  return result;
};
