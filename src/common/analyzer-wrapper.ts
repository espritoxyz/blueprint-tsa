import { existsSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { UIProvider } from "@ton/blueprint";
import { Cell } from "@ton/core";
import { Sym } from "./constants.js";
import { compileFuncFile } from "./build-utils.js";
import { Analyzer } from "./analyzer.js";
import { generateTreeTable, TreeProperty } from "./draw.js";

/**
 * Configuration for analyzer wrapper
 */
export interface AnalyzerWrapperConfig {
  ui: UIProvider;
  checkerPath: string;
  checkerCell: Cell;
  properties?: TreeProperty[];
}

/**
 * Generic wrapper for checker-based vulnerability analysis
 * Handles common logic for compiling, running, and cleaning up checker analysis
 */
export class AnalyzerWrapper {
  private config: AnalyzerWrapperConfig;
  private tempBocPath: string | null = null;
  private tempCheckerCellPath: string | null = null;

  constructor(config: AnalyzerWrapperConfig) {
    this.config = config;
  }

  /**
   * Prints analysis information to UI
   */
  private printAnalysisInfo(): void {
    if (!this.config.properties) {
      return;
    }

    const output = generateTreeTable("TSA analysis", this.config.properties);
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
      await analyzer.run(analyzerArgs);

      this.config.ui.clearActionPrompt();
      this.config.ui.write(`${Sym.OK} Analysis complete.`);
    } finally {
      this.cleanup();
    }
  }
}
