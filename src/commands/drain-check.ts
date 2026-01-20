import { Argv } from "yargs";
import { existsSync } from "fs";
import { beginCell, getMethodId } from "@ton/core";
import { TreeProperty } from "../common/draw.js";
import { Sym, DRAIN_CHECK_SYMBOLIC_FILENAME, DRAIN_CHECK_ID, DRAIN_CHECK_CONCRETE_FILENAME } from "../common/constants.js";
import { buildContracts } from "../common/build-utils.js";
import { findCompiledContract, getCheckerPath } from "../common/paths.js";
import { CommandHandler, CommandContext } from "../cli.js";
import { ReproduceConfig } from "../reproduce/network.js";
import { ConcreteAnalysisConfig } from "../reproduce/concrete-analysis.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";

export const configureDrainCheckCommand = (context: CommandContext): any => {
  return {
    command: DRAIN_CHECK_ID,
    description: "Analyze contract for drain vulnerabilities",
    builder: (yargs: Argv) =>
      yargs
        .option("timeout", {
          alias: "t",
          type: "number",
          description: "Analysis timeout in milliseconds",
        })
        .option("nonce", {
          type: "string",
          description: "Name of get-method for extracting nonce in C4",
        })
        .option("contract", {
          alias: "c",
          type: "string",
          description: "Contract name or path",
          demandOption: true,
        }),
    handler: async (argv: any) => {
      await drainCheckCommand(context, argv);
    },
  };
};

const drainCheckCommand: CommandHandler = async (context: CommandContext, parsedArgs: any) => {
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

  const checkerPath = getCheckerPath(DRAIN_CHECK_SYMBOLIC_FILENAME);
  const timeout = parsedArgs.timeout ?? null;

  const properties: TreeProperty[] = [
    { key: "Contract", value: contract },
    { key: "Mode", value: "TON drain" },
    {
      key: "Options",
      separator: true,
      children: [
        { key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set" }
      ],
    },
  ];

  let nonceMethodId = 0;
  if (parsedArgs.nonce) {
    nonceMethodId = getMethodId(parsedArgs.nonce);
  }

  const checkerCell = beginCell()
    .storeUint(nonceMethodId, 32)
    .storeUint(0, 64)
    .endCell();

  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
  });

  await analyzer.run(DRAIN_CHECK_SYMBOLIC_FILENAME, (wrapper) => [
    "custom-checker-compiled",
    "--checker",
    wrapper.getTempBocPath(),
    "--contract",
    contractPath,
    "--stop-when-exit-codes-found",
    "1000",
    "--checker-data",
    wrapper.getTempCheckerCellPath(),
  ]);
};

export const drainCheckConcrete = async (config: ConcreteAnalysisConfig): Promise<ReproduceConfig> => {
  const { ui } = config;

  if (!existsSync(config.codePath)) {
    ui.write(`\n${Sym.ERR} Code at ${config.codePath} not found`);
    process.exit(1);
  }

  const timeout = config.timeout;

  const properties: TreeProperty[] = [
    { key: "Contract", value: config.contractAddress.toRawString() },
    { key: "Mode", value: "TON drain reproduction" },
    {
      key: "Options",
      separator: true,
      children: [
        { key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set" },
        { key: "Sender", value: config.senderAddress.toRawString() }
      ],
    },
  ];

  const checkerPath = getCheckerPath(DRAIN_CHECK_CONCRETE_FILENAME);
  const checkerCell = beginCell()
    .storeAddress(config.senderAddress)
    .endCell();

  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
  });

  await analyzer.run(DRAIN_CHECK_CONCRETE_FILENAME, (wrapper) => [
    "custom-checker-compiled",
    "--checker",
    wrapper.getTempBocPath(),
    "--contract",
    config.codePath,
    "--data",
    config.dataPath,
    "--stop-when-exit-codes-found",
    "1000",
    "--checker-data",
    wrapper.getTempCheckerCellPath(),
  ]);

  return {
    address: config.contractAddress,
    msgBody: beginCell().endCell(),
    suggestedValue: 0n,
  };
};
