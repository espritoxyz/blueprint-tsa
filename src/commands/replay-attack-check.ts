import { Argv } from "yargs";
import { existsSync } from "fs";
import { beginCell } from "@ton/core";
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

  const checkerPath = getCheckerPath(REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME);
  const timeout = parsedArgs.timeout ?? null;

  const properties: TreeProperty[] = [
    { key: "Contract", value: contract },
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

  await analyzer.run(REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME, (wrapper) => [
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
    ...(parsedArgs.verbose ? ["-v"] : []),
    "--disable-out-message-analysis",
  ]);

  const vulnerability = analyzer.getVulnerability();

  analyzer.reportVulnerability(vulnerability);

  printCleanupInstructions(ui);
};
