import { existsSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { UIProvider } from "@ton/blueprint";
import { Cell } from "@ton/core";
import { Sym, ANALYSIS_INFO_TITLE } from "./constants.js";
import { compileFuncFile } from "./build-utils.js";
import { Analyzer } from "./analyzer.js";
import { generateTreeTable, TreeProperty } from "./draw.js";
import { findExploitExecutionIndex, getMessageValue, getInitialBalance } from "./result-parsing.js";
import {
  getSummaryPath,
  getSarifReportPath,
  getInputsPath,
  getContractDataBocPath,
  getTsaRunLogPath,
  getMsgBodyBocPath,
} from "./paths.js";

/**
 * Configuration for analyzer wrapper
 */
export interface AnalyzerWrapperConfig {
  ui: UIProvider;
  checkerPath: string;
  checkerCell: Cell;
  properties: TreeProperty[];
  codePath: string;
}

export interface VulnerabilityDescription {
  value: bigint;
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
export class AnalyzerWrapper {
  private config: AnalyzerWrapperConfig;
  private tempBocPath: string | null = null;
  private tempCheckerCellPath: string | null = null;
  id: string;

  constructor(config: AnalyzerWrapperConfig) {
    this.config = config;
    this.id = this.generateId();
  }

  /**
   * Generates unique id based on current date and time
   */
  private generateId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const startOfDay = new Date(year, now.getMonth(), now.getDate());
    const milliseconds = now.getTime() - startOfDay.getTime();

    return `${year}-${month}-${day}-${milliseconds}`;
  }

  /**
   * Prints analysis information to UI
   */
  private printAnalysisInfo(): void {
    if (!this.config.properties) {
      return;
    }

    const output = generateTreeTable(ANALYSIS_INFO_TITLE, this.config.properties);
    this.config.ui.write("");
    this.config.ui.write(output);
    this.config.ui.write("");
  }

  /**
   * Validates that checker file exists
   */
  private validateCheckerFile(): void {
    if (!existsSync(this.config.checkerPath)) {
      this.config.ui.write(`\n${Sym.ERR} Checker file not found at ${this.config.checkerPath}`);
      process.exit(1);
    }
  }

  /**
   * Compiles FunC checker to BoC and writes to temporary file
   */
  private async compileChecker(checkerFilename: string): Promise<void> {
    this.config.ui.setActionPrompt(`${Sym.WAIT} Compiling checker...`);

    try {
      const bocCode = await compileFuncFile(this.config.checkerPath, checkerFilename);
      const bocBuffer = Buffer.from(bocCode, "base64");
      this.tempBocPath = path.join(tmpdir(), `checker-${Date.now()}.boc`);
      writeFileSync(this.tempBocPath, bocBuffer);
    } catch (error) {
      this.config.ui.clearActionPrompt();
      this.config.ui.write(`\n${Sym.ERR} Compilation failed: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Writes checker cell to temporary BoC file
   */
  private writeCheckerCell(): void {
    const checkerCellBoc = this.config.checkerCell.toBoc();
    this.tempCheckerCellPath = path.join(tmpdir(), `checker-cell-${Date.now()}.boc`);
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

  /**
   * Runs the checker analysis with custom analyzer arguments
   * @param checkerFilename - Name of the checker file to compile
   * @param buildArgs - Callback function to build analyzer arguments after compilation
   */
  async run(checkerFilename: string, buildArgs: (wrapper: this) => string[]): Promise<void> {
    this.printAnalysisInfo();
    this.validateCheckerFile();
    await this.compileChecker(checkerFilename);
    this.writeCheckerCell();

    try {
      this.config.ui.clearActionPrompt();
      this.config.ui.setActionPrompt(`${Sym.WAIT} Running analysis...`);

      const analyzerArgs = buildArgs(this);
      const analyzer = await Analyzer.create();
      const logPath = getTsaRunLogPath(this.id);
      const result = await analyzer.run(analyzerArgs, logPath);

      writeFileSync(logPath, result.stdout);

      this.config.ui.clearActionPrompt();
      this.config.ui.write(`${Sym.OK} Analysis complete.`);
      this.config.ui.write(`TSA run log available at: ${logPath}`);
    } finally {
      this.cleanup();
    }
  }

  getVulnerability(): VulnerabilityDescription | null {
    const sarifPath = getSarifReportPath(this.id);
    const index = findExploitExecutionIndex(sarifPath);
    if (index === undefined) {
      return null;
    }

    const dataPath = getContractDataBocPath(this.id, index);
    const value = getMessageValue(sarifPath, index);
    const balance = getInitialBalance(sarifPath, index);

    const msgBodyPath = getMsgBodyBocPath(this.id, index);
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

  reportVulnerability(vulnerability: VulnerabilityDescription | null) {
    const summaryPath = getSummaryPath(this.id);
    const sarifPath = getSarifReportPath(this.id);

    if (vulnerability == null) {
      const report = `${Sym.OK} Vulnerability not found.`;
      writeFileSync(summaryPath, report);

      this.config.ui.write("");
      this.config.ui.write(report);
      this.config.ui.write("");
      return;
    }

    const reportLines = [
      `${Sym.WARN} Vulnerability found!`,
      `Summary path: ${summaryPath}`,
      `Input message body and contract data: ${getInputsPath(this.id, vulnerability.executionIndex)}`,
      `SARIF with full information: ${sarifPath}`,
      "",
    ];

    this.config.ui.write("");
    for (const line of reportLines) {
      this.config.ui.write(line);
    }

    const analysisInfo = generateTreeTable(ANALYSIS_INFO_TITLE, this.config.properties);
    const report = analysisInfo + "\n\n" + reportLines.join("\n");
    writeFileSync(summaryPath, report);
  }
}
