import { TSA_URL, TSA_NAME } from "../common/constants.js";
import { findTsaPath, findTSAHomeDirectory } from "../common/paths.js";
import { downloadWithRedirect } from "./downloading.js";
import path from "path";

export const ensureTsaInstalled = async (): Promise<string> => {
  const tsaPath = findTsaPath();
  if (tsaPath != null) {
    return tsaPath;
  }

  await downloadWithRedirect(
    TSA_URL,
    path.join(findTSAHomeDirectory(), TSA_NAME),
  );

  const result = findTsaPath();
  if (result == null) {
    throw new Error("TSA was not installed");
  }

  return result;
};
