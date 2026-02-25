import { Argv } from "yargs";
import { existsSync } from "fs";
import { beginCell } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { TreeProperty } from "../common/draw.js";
import { CommandHandler, CommandContext } from "../cli.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import {
  Sym,
  REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME,
  REPLAY_ATTACK_CHECK_ID,
  ERROR_EXIT_CODE,
} from "../common/constants.js";
import { buildContracts } from "../common/build-utils.js";
import { printCleanupInstructions } from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
} from "../common/paths.js";

export const configureReplayAttackCheckCommand = (
  context: CommandContext,
): any => {
  return {
    command: REPLAY_ATTACK_CHECK_ID,
    description: "Analyze contract for replay attack vulnerabilities",
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
        }),
    handler: async (argv: any) => {
      await replayAttackCheckCommand(context, argv);
    },
  };
};

/**
 * Runs replay attack check analysis and returns the analyzer wrapper
 * @param contractName - Name of the contract
 * @param contractPath - Path to the compiled contract
 * @param ui - UI provider
 * @param timeout - Analysis timeout in seconds
 * @param verbose - Enable verbose output
 * @returns AnalyzerWrapper instance
 */
export const runReplayAttackCheckAnalysis = async (
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  verbose: boolean = false,
  completionMessage: string = "Analysis complete.",
): Promise<AnalyzerWrapper> => {
  const checkerPath = getCheckerPath(REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME);

  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "Replay attack check" },
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
    REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME,
    (wrapper) => [
      "custom-checker-compiled",
      "--checker",
      wrapper.getTempBocPath(),
      "--contract",
      contractPath,
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
      "--disable-out-message-analysis",
    ],
    completionMessage,
  );

  return analyzer;
};

const replayAttackCheckCommand: CommandHandler = async (
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

  const timeout = parsedArgs.timeout ?? null;

  const analyzer = await runReplayAttackCheckAnalysis(
    contract,
    contractPath,
    ui,
    timeout,
    parsedArgs.verbose,
  );

  const vulnerability = analyzer.getVulnerability();

  analyzer.reportVulnerability(vulnerability);

  printCleanupInstructions(ui);
};
