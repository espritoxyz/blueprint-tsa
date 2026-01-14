import { adoptiumOS, adoptiumArch } from "./architecture.js";
import { findTSAHomeDirectory, findJavaBinPath } from "../common/paths.js";
import { downloadWithRedirect } from "./downloading.js";
import fs from "fs";
import path from "path";
import * as tar from "tar";
import { extractZip } from "./unzip.js";

const apiLink =
  `https://api.adoptium.net/v3/binary/latest/17/ga/${adoptiumOS}/${adoptiumArch}/jre/hotspot/normal/eclipse`;

const downloadArchiveWithJava = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    downloadWithRedirect(apiLink, filePath).then(resolve).catch(reject);
  });
};

const unpackArchive = (archivePath: string, extractPath: string): Promise<void> => {
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(extractPath, { recursive: true });
  }
  if (archivePath.endsWith(".zip")) {
    return extractZip(archivePath, extractPath);
  } else {
    return tar.extract({
      file: archivePath,
      cwd: extractPath,
    });
  }
};

export const ensureJavaInstalled = async (): Promise<string> => {
  const javaPath = findJavaBinPath();
  if (javaPath != null) {
    return javaPath;
  }

  const tsaHome = findTSAHomeDirectory();
  const archiveExtension = adoptiumOS === "windows" ? "zip" : "tar.gz";
  const archivePath = path.join(tsaHome, `jre.${archiveExtension}`);
  const jrePath = path.join(tsaHome, "jre");
  await downloadArchiveWithJava(archivePath);
  await unpackArchive(archivePath, jrePath);
  fs.unlinkSync(archivePath);

  const result = findJavaBinPath();
  if (result == null) {
    throw new Error("Java was not installed");
  }

  return result;
};
