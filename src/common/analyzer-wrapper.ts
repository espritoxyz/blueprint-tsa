import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { tmpdir } from "os";
import { UIProvider } from "@ton/blueprint";
import { Cell } from "@ton/core";
import { Sym, ANALYSIS_INFO_TITLE } from "./constants.js";
import { compileFuncFileToBase64Boc } from "./build-utils.js";
import { Analyzer } from "./analyzer.js";
import { generateTreeTable, TreeProperty } from "./draw.js";
import { generateReportId } from "./format-utils.js";
import {
  findExploitExecutionIndex,
  getMessageValue,
  getInitialBalance,
  isSarifResultsEmpty,
} from "./result-parsing.js";
import {
  getSummaryPath,
  getSarifReportPath,
  getInputsPath,
  getContractDataBocPath,
  getTsaRunLogPath,
  getMsgBodyBocPath,
  getMsgBodyTypesPath,
  getReportDirectory,
  getReportDirectoryPath,
  getCompactInputsPath,
  getCompactContractDataBocPath,
  getCompactMsgBodyBocPath,
  getCompactTypedInputPath,
} from "./paths.js";

/**
 * Configuration for analyzer wrapper
 */
export interface AnalyzerWrapperConfig {
  ui: UIProvider;
  checkerPath: string | null;
  checkerCell: Cell;
  properties: TreeProperty[];
  codePath: string;
  legacyAnalysisArtifacts?: boolean;
  expectsSarifReport?: boolean;
}

export interface VulnerabilityDescription {
  value: bigint | null;
  balance: bigint;
  dataPath: string;
  codePath: string;
  executionIndex: number;
  msgBody: Cell;
}

/**
 * Generic wrapper for checker-based vulnerability analysis
 * Handles common logic for compiling, running, and cleaning up checker analysis
 */
const ANALYZER_RUNNING_MESSAGE = "Running TSA analysis...";
const ANALYZER_SUCCESS_LOG_PREFIX = "TSA run log saved to:";
const ANALYZER_NON_EMPTY_LOG_MESSAGE =
  "TSA produced additional log output. Check the log file for details.";
const MISSING_SARIF_ERROR_MESSAGE =
  "TSA finished without producing a SARIF report.";
const PROGRESS_BAR_WIDTH = 20;
const PROGRESS_UPDATE_INTERVAL_MS = 1000;
const PROGRESS_COMPLETION_DISPLAY_MS = 500;
const MILLISECONDS_PER_SECOND = 1000;
const FULL_PROGRESS_PERCENT = 100;
const EXECUTION_DIRECTORY_PREFIX = "execution_";
const CONTRACT_DATA_DIRECTORY = "c4_1";
const EXTRA_CONTRACT_DATA_DIRECTORY = "c4_2";
const MESSAGE_BODY_DIRECTORY = "msgBody_0";
const CELL_BOC_FILE = "cell.boc";
const CELL_TYPES_FILE = "cell-types.yaml";
const MESSAGE_BODY_INPUT_KEY = "messageBody";
const CONTRACT_DATA_INPUT_KEY = "contractData";
const INDENT_SIZE = 2;

export class AnalyzerWrapper {
  private config: AnalyzerWrapperConfig;
  private tempBocPath: string | null = null;
  private tempCheckerCellPath: string | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  id: string;

  constructor(config: AnalyzerWrapperConfig) {
    this.config = config;
    this.id = generateReportId();
  }

  /**
   * Prints analysis information to UI
   */
  private printAnalysisInfo(): void {
    if (!this.config.properties) {
      return;
    }

    const output = generateTreeTable(
      ANALYSIS_INFO_TITLE,
      this.config.properties,
    );
    this.config.ui.write("");
    this.config.ui.write(output);
    this.config.ui.write("");
  }

  /**
   * Validates that checker file exists
   */
  private validateCheckerFile(): void {
    if (
      this.config.checkerPath != null &&
      !existsSync(this.config.checkerPath)
    ) {
      this.config.ui.write(
        `\n${Sym.ERR} Checker file not found at ${this.config.checkerPath}`,
      );
      process.exit(1);
    }
  }

  /**
   * Compiles FunC checker to BoC and writes to temporary file
   */
  private async compileChecker(checkerFilename: string): Promise<void> {
    if (this.config.checkerPath == null) {
      return;
    }

    this.config.ui.setActionPrompt(`${Sym.WAIT} Compiling checker...`);

    try {
      const bocCode = await compileFuncFileToBase64Boc(
        this.config.checkerPath,
        checkerFilename,
      );
      const bocBuffer = Buffer.from(bocCode, "base64");
      this.tempBocPath = path.join(tmpdir(), `checker-${Date.now()}.boc`);
      writeFileSync(this.tempBocPath, bocBuffer);
    } catch (error) {
      this.config.ui.clearActionPrompt();
      this.config.ui.write(
        `\n${Sym.ERR} Compilation failed: ${(error as Error).message}`,
      );
      process.exit(1);
    }
  }

  /**
   * Writes checker cell to temporary BoC file
   */
  private writeCheckerCell(): void {
    const checkerCellBoc = this.config.checkerCell.toBoc();
    this.tempCheckerCellPath = path.join(
      tmpdir(),
      `checker-cell-${Date.now()}.boc`,
    );
    writeFileSync(this.tempCheckerCellPath, checkerCellBoc);
  }

  /**
   * Cleans up temporary files
   */
  private cleanup(): void {
    if (this.tempBocPath && existsSync(this.tempBocPath)) {
      unlinkSync(this.tempBocPath);
    }
    if (this.tempCheckerCellPath && existsSync(this.tempCheckerCellPath)) {
      unlinkSync(this.tempCheckerCellPath);
    }
  }

  /**
   * Gets the temporary BoC file path (for use in analyzer arguments)
   */
  getTempBocPath(): string {
    if (!this.tempBocPath) {
      throw new Error("Checker not compiled yet");
    }
    return this.tempBocPath;
  }

  /**
   * Gets the temporary checker cell file path (for use in analyzer arguments)
   */
  getTempCheckerCellPath(): string {
    if (!this.tempCheckerCellPath) {
      throw new Error("Checker cell not written yet");
    }
    return this.tempCheckerCellPath;
  }

  private formatProgressBar(progressRatio: number): string {
    const boundedProgressRatio = Math.min(Math.max(progressRatio, 0), 1);
    const percent = Math.min(
      Math.round(boundedProgressRatio * FULL_PROGRESS_PERCENT),
      FULL_PROGRESS_PERCENT,
    );
    const filledSegments = Math.round(
      boundedProgressRatio * PROGRESS_BAR_WIDTH,
    );
    const emptySegments = PROGRESS_BAR_WIDTH - filledSegments;
    const progressBar = `${"█".repeat(filledSegments)}${"░".repeat(emptySegments)}`;

    return `[${progressBar}] ${percent}%`;
  }

  private formatElapsedProgress(
    elapsedSeconds: number,
    timeoutSeconds: number,
  ): string {
    const boundedElapsedSeconds = Math.max(0, elapsedSeconds);
    const boundedTimeoutSeconds = Math.max(1, timeoutSeconds);
    const progressRatio = boundedElapsedSeconds / boundedTimeoutSeconds;

    return `${ANALYZER_RUNNING_MESSAGE} ${this.formatProgressBar(progressRatio)} (${boundedElapsedSeconds}s/${boundedTimeoutSeconds}s)`;
  }

  private startProgressBar(timeoutSeconds: number | null): void {
    this.stopProgressBar();

    if (timeoutSeconds === null) {
      this.config.ui.setActionPrompt(`${Sym.WAIT} ${ANALYZER_RUNNING_MESSAGE}`);
      return;
    }

    const startedAt = Date.now();
    const updateProgress = () => {
      const elapsedMilliseconds = Date.now() - startedAt;
      const elapsedSeconds = Math.floor(
        elapsedMilliseconds / MILLISECONDS_PER_SECOND,
      );
      this.config.ui.setActionPrompt(
        `${Sym.WAIT} ${this.formatElapsedProgress(elapsedSeconds, timeoutSeconds)}`,
      );
    };

    updateProgress();
    this.progressTimer = setInterval(
      updateProgress,
      PROGRESS_UPDATE_INTERVAL_MS,
    );
  }

  private stopProgressBar(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private async showCompletedProgressBar(
    timeoutSeconds: number | null,
  ): Promise<void> {
    this.stopProgressBar();

    if (timeoutSeconds === null) {
      return;
    }

    this.config.ui.setActionPrompt(
      `${Sym.WAIT} ${ANALYZER_RUNNING_MESSAGE} ${this.formatProgressBar(1)}`,
    );

    await new Promise((resolve) => {
      setTimeout(resolve, PROGRESS_COMPLETION_DISPLAY_MS);
    });
  }

  private indentYamlContent(content: string): string {
    return content
      .split("\n")
      .map((line) => `${" ".repeat(INDENT_SIZE)}${line}`)
      .join("\n");
  }

  private mergeYamlDocuments(
    messageBodyPath: string,
    contractDataPath: string,
  ): string | null {
    const messageBodyContent = existsSync(messageBodyPath)
      ? readFileSync(messageBodyPath, "utf8").trim()
      : "";
    const contractDataContent = existsSync(contractDataPath)
      ? readFileSync(contractDataPath, "utf8").trim()
      : "";

    const sections: string[] = [];
    if (messageBodyContent.length > 0) {
      sections.push(
        `${MESSAGE_BODY_INPUT_KEY}:\n${this.indentYamlContent(messageBodyContent)}`,
      );
    }
    if (contractDataContent.length > 0) {
      sections.push(
        `${CONTRACT_DATA_INPUT_KEY}:\n${this.indentYamlContent(contractDataContent)}`,
      );
    }

    if (sections.length === 0) {
      return null;
    }

    return `${sections.join("\n")}\n`;
  }

  private getResolvedInputsPath(executionIndex: number): string {
    return this.config.legacyAnalysisArtifacts
      ? getInputsPath(this.id, executionIndex)
      : getCompactInputsPath(this.id);
  }

  private getResolvedContractDataBocPath(executionIndex: number): string {
    return this.config.legacyAnalysisArtifacts
      ? getContractDataBocPath(this.id, executionIndex)
      : getCompactContractDataBocPath(this.id);
  }

  private getResolvedMsgBodyBocPath(executionIndex: number): string {
    return this.config.legacyAnalysisArtifacts
      ? getMsgBodyBocPath(this.id, executionIndex)
      : getCompactMsgBodyBocPath(this.id);
  }

  private getResolvedTypedInputPath(executionIndex: number): string {
    return this.config.legacyAnalysisArtifacts
      ? getMsgBodyTypesPath(this.id, executionIndex)
      : getCompactTypedInputPath(this.id);
  }

  private removeDirectoryIfEmpty(directoryPath: string): void {
    if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
      return;
    }

    if (readdirSync(directoryPath).length === 0) {
      rmSync(directoryPath, { recursive: true, force: true });
    }
  }

  private normalizeExportedInputs(): void {
    if (this.config.legacyAnalysisArtifacts) {
      return;
    }

    const reportDir = path.dirname(getSummaryPath(this.id));
    const sarifPath = getSarifReportPath(this.id);
    const exploitExecutionIndex = findExploitExecutionIndex(sarifPath);
    const executionDirs = readdirSync(reportDir)
      .filter((entry) => entry.startsWith(EXECUTION_DIRECTORY_PREFIX))
      .map((entry) => path.join(reportDir, entry))
      .filter((entryPath) => statSync(entryPath).isDirectory());

    for (const executionDir of executionDirs) {
      const executionIndex = Number.parseInt(
        path.basename(executionDir).replace(EXECUTION_DIRECTORY_PREFIX, ""),
        10,
      );

      if (
        Number.isNaN(executionIndex) ||
        executionIndex !== exploitExecutionIndex
      ) {
        rmSync(executionDir, { recursive: true, force: true });
        continue;
      }

      const contractDataDir = path.join(executionDir, CONTRACT_DATA_DIRECTORY);
      const extraContractDataDir = path.join(
        executionDir,
        EXTRA_CONTRACT_DATA_DIRECTORY,
      );
      const messageBodyDir = path.join(executionDir, MESSAGE_BODY_DIRECTORY);
      const contractDataBocSource = path.join(contractDataDir, CELL_BOC_FILE);
      const contractDataTypesSource = path.join(
        contractDataDir,
        CELL_TYPES_FILE,
      );
      const msgBodyBocSource = path.join(messageBodyDir, CELL_BOC_FILE);
      const msgBodyTypesSource = path.join(messageBodyDir, CELL_TYPES_FILE);

      mkdirSync(reportDir, { recursive: true });

      if (existsSync(contractDataBocSource)) {
        writeFileSync(
          getCompactContractDataBocPath(this.id),
          readFileSync(contractDataBocSource),
        );
      }

      if (existsSync(msgBodyBocSource)) {
        writeFileSync(
          getCompactMsgBodyBocPath(this.id),
          readFileSync(msgBodyBocSource),
        );
      }

      const mergedTypedInput = this.mergeYamlDocuments(
        msgBodyTypesSource,
        contractDataTypesSource,
      );
      const typedInputPath = getCompactTypedInputPath(this.id);
      if (mergedTypedInput !== null) {
        writeFileSync(typedInputPath, mergedTypedInput);
      } else if (existsSync(typedInputPath)) {
        unlinkSync(typedInputPath);
      }

      rmSync(executionDir, { recursive: true, force: true });
      if (existsSync(extraContractDataDir)) {
        rmSync(extraContractDataDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Runs the checker analysis with custom analyzer arguments
   * @param checkerFilename - Name of the checker file to compile
   * @param buildArgs - Callback function to build analyzer arguments after compilation
   */
  async run(
    checkerFilename: string | null,
    buildArgs: (wrapper: this) => string[],
    completionMessage: string = "Analysis complete.",
  ): Promise<void> {
    this.printAnalysisInfo();
    this.validateCheckerFile();

    if (checkerFilename != null) {
      await this.compileChecker(checkerFilename);
    }
    this.writeCheckerCell();

    try {
      this.config.ui.clearActionPrompt();

      const analyzerArgs = buildArgs(this);
      const timeoutIndex = analyzerArgs.indexOf("--timeout");
      const timeoutValue =
        timeoutIndex >= 0 ? (analyzerArgs[timeoutIndex + 1] ?? null) : null;
      const timeoutSeconds =
        timeoutValue !== null ? Number.parseInt(timeoutValue, 10) : null;
      const analyzer = await Analyzer.create();
      const logPath = getTsaRunLogPath(this.id);

      this.startProgressBar(
        Number.isFinite(timeoutSeconds) ? timeoutSeconds : null,
      );
      const result = await analyzer.run(analyzerArgs, logPath);

      const hasLogOutput = result.stdout.trim().length > 0;
      if (hasLogOutput) {
        writeFileSync(logPath, result.stdout);
      } else if (existsSync(logPath)) {
        unlinkSync(logPath);
      }

      if (this.config.expectsSarifReport !== false) {
        const sarifPath = getSarifReportPath(this.id);
        if (!existsSync(sarifPath)) {
          throw new Error(MISSING_SARIF_ERROR_MESSAGE);
        }

        if (
          !this.usesVerboseAnalysisArtifacts() &&
          isSarifResultsEmpty(sarifPath)
        ) {
          if (!hasLogOutput) {
            rmSync(getReportDirectory(this.id), {
              recursive: true,
              force: true,
            });
          }
        } else {
          this.normalizeExportedInputs();
        }
      }

      await this.showCompletedProgressBar(
        Number.isFinite(timeoutSeconds) ? timeoutSeconds : null,
      );
      this.config.ui.clearActionPrompt();
      this.config.ui.write(`${Sym.OK} ${completionMessage}`);
      if (hasLogOutput) {
        this.config.ui.write(`${ANALYZER_SUCCESS_LOG_PREFIX} ${logPath}`);
        this.config.ui.write(`${Sym.WARN} ${ANALYZER_NON_EMPTY_LOG_MESSAGE}`);
      }
    } finally {
      this.stopProgressBar();
      this.config.ui.clearActionPrompt();
      this.cleanup();
    }
  }

  usesVerboseAnalysisArtifacts(): boolean {
    return this.config.legacyAnalysisArtifacts ?? false;
  }

  getVulnerabilityFromReport(): VulnerabilityDescription | null {
    const sarifPath = getSarifReportPath(this.id);
    if (!existsSync(sarifPath)) {
      return null;
    }

    const index = findExploitExecutionIndex(sarifPath);
    if (index === undefined) {
      return null;
    }

    const dataPath = this.getResolvedContractDataBocPath(index);
    const value = getMessageValue(sarifPath, index);
    const balance = getInitialBalance(sarifPath, index);

    const msgBodyPath = this.getResolvedMsgBodyBocPath(index);
    const msgBodyBuffer = readFileSync(msgBodyPath);
    const msgBody = Cell.fromBoc(msgBodyBuffer)[0];

    return {
      value,
      balance,
      dataPath,
      codePath: this.config.codePath,
      executionIndex: index,
      msgBody,
    };
  }

  vulnerabilityIsPresent(): boolean {
    const sarifPath = getSarifReportPath(this.id);
    if (!existsSync(sarifPath)) {
      return false;
    }

    const index = findExploitExecutionIndex(sarifPath);
    return index !== undefined;
  }

  reportVulnerability(
    vulnerability: VulnerabilityDescription | null,
    descriptionUrl?: string,
  ) {
    const reportDirectoryPath = getReportDirectoryPath(this.id);
    const sarifPath = path.join(reportDirectoryPath, "report.sarif");

    if (vulnerability == null) {
      const report = `${Sym.OK} Vulnerability not found.`;

      this.config.ui.write("");
      this.config.ui.write(report);
      this.config.ui.write("");

      if (existsSync(reportDirectoryPath)) {
        const summaryPath = path.join(reportDirectoryPath, "summary.txt");
        writeFileSync(summaryPath, report);
      }
      return;
    }

    const summaryPath = getSummaryPath(this.id);

    const typedInputLine = this.usesVerboseAnalysisArtifacts()
      ? `Typed input: ${this.getResolvedTypedInputPath(vulnerability.executionIndex)}`
      : `typed-input.yaml: ${this.getResolvedTypedInputPath(vulnerability.executionIndex)}`;

    const reportLines = [
      `${Sym.WARN} Vulnerability found!`,
      `Summary path: ${summaryPath}`,
      typedInputLine,
      `SARIF with full information: ${sarifPath}`,
    ];

    if (descriptionUrl) {
      reportLines.push("");
      reportLines.push(`Description of the vulnerability: ${descriptionUrl}`);
    }

    reportLines.push("");

    this.config.ui.write("");
    for (const line of reportLines) {
      this.config.ui.write(line);
    }

    const analysisInfo = generateTreeTable(
      ANALYSIS_INFO_TITLE,
      this.config.properties,
    );
    const report = analysisInfo + "\n\n" + reportLines.join("\n");
    writeFileSync(summaryPath, report);
  }
}
