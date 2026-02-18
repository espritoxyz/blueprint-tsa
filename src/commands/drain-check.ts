import path from "path";
import {Argv} from "yargs";
import {existsSync} from "fs";
import {beginCell, getMethodId, toNano} from "@ton/core";
import {TreeProperty} from "../common/draw.js";
import {CommandHandler, CommandContext} from "../cli.js";
import {ReproduceParameters} from "../reproduce/network.js";
import {ConcreteAnalysisConfig} from "../reproduce/concrete-analysis.js";
import {AnalyzerWrapper} from "../common/analyzer-wrapper.js";
import {writeReproduceConfig} from "../reproduce/build-config.js";
import {
  Sym,
  DRAIN_CHECK_SYMBOLIC_FILENAME,
  DRAIN_CHECK_ID,
  DRAIN_CHECK_CONCRETE_FILENAME,
  ERROR_EXIT_CODE
} from "../common/constants.js";
import {buildContracts} from "../common/build-utils.js";
import {printCleanupInstructions} from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
  getReproduceConfigPath,
} from "../common/paths.js";

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
      await drainCheckCommand(context, argv);
    },
  };
};

const drainCheckCommand: CommandHandler = async (context: CommandContext, parsedArgs: any) => {
  const {ui} = context;

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
    {key: "Contract", value: contract},
    {key: "Mode", value: "TON drain"},
    {
      key: "Options",
      separator: true,
      children: [
        {key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set"}
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

  await analyzer.run(DRAIN_CHECK_SYMBOLIC_FILENAME, (wrapper) => [
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
  ]);

  const vulnerability = analyzer.getVulnerability();
  analyzer.reportVulnerability(vulnerability);

  printCleanupInstructions(ui);

  if (vulnerability != null) {
    writeReproduceConfig(vulnerability, DRAIN_CHECK_ID, timeout, analyzer.id, {kind: "drain-check"});
    const configPath = getReproduceConfigPath(analyzer.id);
    const relativeConfigPath = path.relative(process.cwd(), configPath);
    ui.write("To reproduce the vulnerability on the blockchain, run:");
    ui.write(`> yarn blueprint tsa reproduce --config ${relativeConfigPath}`);

    process.exit(2);
  }
};

export const drainCheckConcrete = async (config: ConcreteAnalysisConfig): Promise<ReproduceParameters | null> => {
  const {ui} = config;

  if (!existsSync(config.codePath)) {
    ui.write(`\n${Sym.ERR} Code at ${config.codePath} not found`);
    process.exit(1);
  }

  const timeout = config.timeout;

  const properties: TreeProperty[] = [
    {key: "Contract", value: config.contractAddress.toRawString()},
    {key: "Mode", value: "TON drain reproduction"},
    {
      key: "Options",
      separator: true,
      children: [
        {key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set"},
        {key: "Sender", value: config.senderAddress.toRawString()}
      ],
    },
  ];

  const maxTons = toNano(await ui.input("Enter maximum amount of TONs for reproduction message:"));

  const checkerPath = getCheckerPath(DRAIN_CHECK_CONCRETE_FILENAME);
  const checkerCell = beginCell()
    .storeAddress(config.senderAddress)
    .storeCoins(maxTons)
    .endCell();

  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
    codePath: config.codePath,
  });

  await analyzer.run(DRAIN_CHECK_CONCRETE_FILENAME, (wrapper) => [
    "custom-checker-compiled",
    "--checker",
    wrapper.getTempBocPath(),
    "--contract",
    config.codePath,
    "--data",
    config.dataPath,
    "--balance",
    config.balance.toString(),
    "--address",
    config.contractAddress.toRawString(),
    "--stop-when-exit-codes-found",
    ERROR_EXIT_CODE.toString(),
    "--checker-data",
    wrapper.getTempCheckerCellPath(),
    "--output",
    getSarifReportPath(wrapper.id),
    "--exported-inputs",
    getReportDirectory(wrapper.id),
    ...(config.timeout != null ? ["--timeout", config.timeout.toString()] : []),
  ]);

  const vulnerability = analyzer.getVulnerability();
  if (vulnerability == null) {
    ui.write(`${Sym.WARN} Vulnerability couldn't be reproduced with concrete data.`);
    return null;
  }

  if (vulnerability.value == null) {
    throw new Error("Unexpected external message");
  }

  return {
    address: config.contractAddress,
    msgBody: vulnerability.msgBody,
    suggestedValue: vulnerability.value,
  };
};
