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

export const findTSAReportsDirectory = (): string => {
  const tsaDir = findTSAProjectDirectory();
  const result = path.join(tsaDir, "reports");
  if (!fs.existsSync(result)) {
    fs.mkdirSync(result, { recursive: true });
  }
  return result;
};

export const getReportDirectoryPath = (id: string): string => {
  const reportsDir = findTSAReportsDirectory();
  return path.join(reportsDir, `run-${id}`);
};

export const getReportDirectory = (id: string): string => {
  const result = getReportDirectoryPath(id);
  if (!fs.existsSync(result)) {
    fs.mkdirSync(result, { recursive: true });
  }
  return result;
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
    throw new Error(
      `Unexpected content in JRE directory: expected empty or single directory, found ${contents.length} items`,
    );
  }

  const javaHomePath = path.join(jre, contents[0]);
  let binPath = path.join(javaHomePath, "bin");
  if (process.platform == "darwin") {
    binPath = `${javaHomePath}/Contents/Home/bin`;
  }
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
  return path.join(path.dirname(__filename), "../../src/checkers", checkerName);
};

export const getSarifReportPath = (id: string): string => {
  const reportDir = getReportDirectoryPath(id);
  return path.join(reportDir, "report.sarif");
};

export const getSummaryPath = (id: string): string => {
  const reportDir = getReportDirectoryPath(id);
  return path.join(reportDir, "summary.txt");
};

export const getInputsPath = (id: string, index: number): string => {
  const reportDir = getReportDirectoryPath(id);
  return path.join(reportDir, `execution_${index}`);
};

export const getReproduceConfigPath = (id: string): string => {
  const reportDir = getReportDirectoryPath(id);
  return path.join(reportDir, "tsa-reproduce-config.json");
};

const CONTRACT_DATA_BOC_FILE = "contract-data.boc";
const MESSAGE_BODY_BOC_FILE = "message-body.boc";
const TYPED_INPUT_FILE = "typed-input.yaml";

export const getCompactInputsPath = (id: string): string => {
  return getReportDirectoryPath(id);
};

export const getCompactContractDataBocPath = (id: string): string => {
  return path.join(getCompactInputsPath(id), CONTRACT_DATA_BOC_FILE);
};

export const getCompactMsgBodyBocPath = (id: string): string => {
  return path.join(getCompactInputsPath(id), MESSAGE_BODY_BOC_FILE);
};

export const getCompactTypedInputPath = (id: string): string => {
  return path.join(getCompactInputsPath(id), TYPED_INPUT_FILE);
};

export const getContractDataBocPath = (id: string, index: number): string => {
  const inputsPath = getInputsPath(id, index);
  return path.join(path.join(inputsPath, "c4_1"), "cell.boc");
};

export const getContractDataTypesPath = (id: string, index: number): string => {
  const inputsPath = getInputsPath(id, index);
  return path.join(path.join(inputsPath, "c4_1"), "cell-types.yaml");
};

export const getMsgBodyBocPath = (id: string, index: number): string => {
  const inputsPath = getInputsPath(id, index);
  return path.join(path.join(inputsPath, "msgBody_0"), "cell.boc");
};

export const getMsgBodyTypesPath = (id: string, index: number): string => {
  const inputsPath = getInputsPath(id, index);
  return path.join(path.join(inputsPath, "msgBody_0"), "cell-types.yaml");
};

export const getTsaRunLogPath = (id: string): string => {
  const reportDir = getReportDirectoryPath(id);
  return path.join(reportDir, "tsa.log");
};

export const getThrowerPath = (): string => {
  return path.join(
    path.dirname(__filename),
    "../../src/checkers",
    "thrower.fc",
  );
};
