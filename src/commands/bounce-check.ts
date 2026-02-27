import { Argv } from "yargs";
import { existsSync, writeFileSync } from "fs";
import { beginCell } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { TreeProperty } from "../common/draw.js";
import { CommandHandler, CommandContext } from "../cli.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import {
  Sym,
  BOUNCE_CHECK_FILENAME,
  BOUNCE_CHECK_ID,
  BOUNCE_CHECK_SCHEME_FILENAME,
  ERROR_EXIT_CODE,
  BOUNCE_CHECK_NAME,
  THROWER_FILENAME,
  BOUNCE_DESCRIPTION_URL,
} from "../common/constants.js";
import {
  buildContracts,
  compileFuncFileToBase64Boc,
} from "../common/build-utils.js";
import { doWithTemporaryFile } from "../common/file-utils.js";
import { printCleanupInstructions } from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
  getThrowerPath,
} from "../common/paths.js";
import { extractOpcodes } from "../common/opcode-extractor.js";
import { tmpdir } from "os";
import path from "path";

const ONE_MINUTE_SECONDS = 60;

export const configureBounceCheckCommand = (context: CommandContext): any => {
  return {
    command: BOUNCE_CHECK_ID,
    description: "Check if contract processes bounced messages correctly",
    builder: (yargs: Argv) =>
      yargs
        .option("timeout", {
          alias: "t",
          type: "number",
          description: "Analysis timeout in seconds",
        })
        .option("contract", {
          alias: "c",
          type: "string",
          description: "Contract name",
          demandOption: true,
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          description: "Use debug output in TSA log",
        })
        .option("disable-opcode-extraction", {
          type: "boolean",
          description:
            "Disable opcode extraction. This affects path selection strategy and default timeout.",
        }),
    handler: async (argv: any) => {
      await bounceCheckCommand(context, argv);
    },
  };
};

/**
 * Runs bounce check analysis and returns the analyzer wrapper
 * @param contractName - Name of the contract
 * @param contractPath - Path to the compiled contract
 * @param ui - UI provider
 * @param timeout - Analysis timeout in seconds
 * @param opcodes - List of opcodes to analyze
 * @param verbose - Enable verbose output
 * @returns AnalyzerWrapper instance
 */
export const runBounceCheckAnalysis = async (
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  opcodes: number[],
  verbose: boolean = false,
  completionMessage: string = "Analysis complete.",
): Promise<AnalyzerWrapper> => {
  const checkerPath = getCheckerPath(BOUNCE_CHECK_FILENAME);
  const schemePath = getCheckerPath(BOUNCE_CHECK_SCHEME_FILENAME);
  const throwerFuncPath = getThrowerPath();

  // Compile thrower FunC to BoC
  const throwerBocBase64 = await compileFuncFileToBase64Boc(
    throwerFuncPath,
    THROWER_FILENAME,
  );

  // Write compiled BoC to temporary file and run analysis
  const tempThrowerBocPath = path.join(tmpdir(), `thrower-${Date.now()}.boc`);

  return doWithTemporaryFile(async (tempPath) => {
    writeFileSync(tempPath, Buffer.from(throwerBocBase64, "base64"));

    const properties: TreeProperty[] = [
      { key: "Contract", value: contractName },
      { key: "Mode", value: BOUNCE_CHECK_NAME },
      {
        key: "Options",
        separator: true,
        children: [
          {
            key: "Timeout",
            value: timeout !== null ? `${timeout} seconds` : "not set",
          },
        ],
      },
    ];

    const checkerCell = beginCell().endCell();

    const analyzer = new AnalyzerWrapper({
      ui,
      checkerPath,
      checkerCell,
      properties,
      codePath: contractPath,
    });

    const reportDir = getReportDirectory(analyzer.id);
    const sarifPath = getSarifReportPath(analyzer.id);

    await analyzer.run(
      BOUNCE_CHECK_FILENAME,
      (wrapper) => [
        "custom-checker-compiled",
        "--checker",
        wrapper.getTempBocPath(),
        "--contract",
        contractPath,
        "--contract",
        tempPath,
        "--stop-when-exit-codes-found",
        ERROR_EXIT_CODE.toString(),
        "--checker-data",
        wrapper.getTempCheckerCellPath(),
        "--output",
        sarifPath,
        ...(timeout != null ? ["--timeout", timeout.toString()] : []),
        "--exported-inputs",
        reportDir,
        ...(verbose ? ["-v"] : []),
        "--scheme",
        schemePath,
        "--continue-on-contract-exception",
        ...opcodes.flatMap((opcode) => ["--opcode", opcode.toString()]),
      ],
      completionMessage,
    );

    return analyzer;
  }, tempThrowerBocPath);
};

const bounceCheckCommand: CommandHandler = async (
  context: CommandContext,
  parsedArgs: any,
) => {
  const { ui } = context;

  await buildContracts(ui);

  if (!parsedArgs.contract) {
    throw new Error("Contract name or path is required");
  }
  const contract = parsedArgs.contract;
  const contractPath = findCompiledContract(contract);

  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${contract} not found`);
    process.exit(1);
  }

  let opcodes: number[] = [];
  if (!parsedArgs["disable-opcode-extraction"]) {
    opcodes = await extractOpcodes({
      ui,
      codePath: contractPath,
      contractName: contract,
    });
  }

  let timeout = parsedArgs.timeout ?? null;

  // If timeout wasn't provided, set it to 1 minute * (number_of_opcodes + 1)
  if (timeout === null && opcodes.length > 0) {
    timeout = ONE_MINUTE_SECONDS * (opcodes.length + 1);
    ui.write("");
    ui.write(
      "The timeout was calculated automatically based on the number of opcodes.",
    );
  }

  const analyzer = await runBounceCheckAnalysis(
    contract,
    contractPath,
    ui,
    timeout,
    opcodes,
    parsedArgs.verbose,
  );

  const vulnerability = analyzer.getVulnerability();

  analyzer.reportVulnerability(vulnerability, BOUNCE_DESCRIPTION_URL);

  printCleanupInstructions(ui);
};
