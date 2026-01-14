import { TSA_VERSION } from "../common/constants.js";
import { findTsaPath, findTSAHomeDirectory } from "../common/paths.js";
import { downloadWithRedirect } from "./downloading.js";
import path from "path";

const TSA_URL = `https://github.com/espritoxyz/tsa/releases/download/${TSA_VERSION}/tsa-cli.jar`;

export const ensureTsaInstalled = async (): Promise<string> => {
  const tsaPath = findTsaPath();
  if (tsaPath != null) {
    return tsaPath;
  }

  await downloadWithRedirect(TSA_URL, path.join(findTSAHomeDirectory(), "tsa-cli.jar"));

  const result = findTsaPath();
  if (result == null) {
    throw new Error("TSA was not installed");
  }

  return result;
};