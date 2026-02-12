import path from "path";
import {Argv} from "yargs";
import {existsSync} from "fs";
import {beginCell, toNano} from "@ton/core";
import {TreeProperty} from "../common/draw.js";
import {CommandContext, CommandHandler} from "../cli.js";
import {AnalyzerWrapper} from "../common/analyzer-wrapper.js";
import {writeReproduceConfig} from "../reproduce/build-config.js";
import {
  DRAIN_CHECK_CONCRETE_FILENAME,
  ERROR_EXIT_CODE,
  OWNER_HIJACK_CHECK,
  OWNER_HIJACK_CHECK_ID,
  OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME,
  Sym
} from "../common/constants.js";
import {buildContracts} from "../common/build-utils.js";
import {printCleanupInstructions} from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getReportDirectory,
  getReproduceConfigPath,
  getSarifReportPath,
} from "../common/paths.js";
import {UIProvider} from "@ton/blueprint";
import {ConcreteAnalysisConfig} from "../reproduce/concrete-analysis.js";
import {ReproduceParameters} from "../reproduce/network.js";
import {OwnerHijackOptions} from "../reproduce/reproduce-config.js";

export const configureOwnerHijackCommand = (context: CommandContext): any => ({
  command: OWNER_HIJACK_CHECK,
  description: "Analyze contract for the possibility of owner hijack",
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
      .option("methodid", {
        alias: "m",
        type: "number",
        description: "The method id of get_owner getter",
        demandOption: true,
      })
      .option("verbose", {
        alias: "v",
        type: "boolean",
        description: "Use debug output in TSA log",
      }),
  handler: async (argv: any) => await ownerHijackCommand(context, argv),
});


const extractOptions = (ui: UIProvider, parsedArgs: any) => {
  const contract = parsedArgs.contract;
  if (typeof contract !== "string") {
    throw new Error("Contract name or path is required");
  }

  const timeout: number | null = parsedArgs.timeout ?? null;

  const methodid = parsedArgs.methodid;
  if (typeof methodid != "number") {
    ui.write("methodId required");
    process.exit(-1);
  }

  if (!Number.isInteger(methodid)) {
    throw new Error("MethodId is not an integer");
  }
  const methodId = BigInt(methodid);

  const options = {
    contract,
    timeout,
    methodId,
  };

  const properties: TreeProperty[] = [
    {key: "Contract", value: options.contract},
    {key: "Mode", value: "TON owner hijack"},
    {
      key: "Options",
      separator: true,
      children: [
        {key: "Timeout", value: options.timeout !== null ? `${(options.timeout)} seconds` : "not set"},
        {key: "Method id", value: options.methodId.toString()}
      ],
    },
  ];
  return {options, properties};
};


const ownerHijackCommand: CommandHandler = async (context: CommandContext, parsedArgs: any) => {
  const {ui} = context;
  await buildContracts(ui);
  const {options, properties} = extractOptions(ui, parsedArgs);

  const contractPath = findCompiledContract(options.contract);
  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${(options.contract)} not found`);
    process.exit(1);
  }

  const checkerPath = getCheckerPath(OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME);
  const checkerCell = beginCell().storeUint(options.methodId, 32).endCell();
  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
    codePath: contractPath,
  });

  const reportDir = getReportDirectory(analyzer.id);
  const sarifPath = getSarifReportPath(analyzer.id);

  await analyzer.run(OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME, wrapper => [
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
    ...(options.timeout != null ? ["--timeout", options.timeout.toString()] : []),
    "--exported-inputs",
    reportDir,
    ...(parsedArgs.verbose ? ["-v"] : []),
  ]);

  const vulnerability = analyzer.getVulnerability();
  analyzer.reportVulnerability(vulnerability);

  printCleanupInstructions(ui);

  if (vulnerability != null) {
    writeReproduceConfig(vulnerability, OWNER_HIJACK_CHECK_ID, options.timeout, analyzer.id, {
      kind: "owner-hijack-check",
      methodId: options.methodId.toString(),
    });
    const configPath = getReproduceConfigPath(analyzer.id);
    const relativeConfigPath = path.relative(process.cwd(), configPath);
    ui.write("To reproduce the vulnerability on the blockchain, run:");
    ui.write(`> yarn blueprint tsa-reproduce ${relativeConfigPath}`);

    process.exit(2);
  }
};


const readNanotons = async (request: string, ui: UIProvider): Promise<bigint> => {
  while (true) {
    const userInput = await ui.input(request);
    try {
      return toNano(userInput);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      ui.write(`Your input (${userInput}) was of not correct nanoton format. Please try again.`);
    }
  }
};

export const ownerHijackCheckConcrete = async (config: ConcreteAnalysisConfig, concreteCheckerOptions: OwnerHijackOptions): Promise<ReproduceParameters | null> => {
  const {ui} = config;

  if (!existsSync(config.codePath)) {
    ui.write(`\n${Sym.ERR} Code at ${config.codePath} not found`);
    process.exit(1);
  }

  const timeout = config.timeout;

  const properties: TreeProperty[] = [
    {key: "Contract", value: config.contractAddress.toRawString()},
    {key: "Mode", value: "TON owner hijack reproduction"},
    {
      key: "Options",
      separator: true,
      children: [
        {key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set"},
        {key: "Method id", value: timeout !== null ? `${timeout} seconds` : "not set"},
        {key: "Sender", value: config.senderAddress.toRawString()}
      ],
    },
  ];

  const maxTons = await readNanotons("Enter maximum amount of TONs for reproduction message:", ui);

  const checkerPath = getCheckerPath(DRAIN_CHECK_CONCRETE_FILENAME);
  const methodId = () => {
    const stringedMethodId = concreteCheckerOptions.methodId;
    try {
      return BigInt(stringedMethodId);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
      throw new Error(`Invalid BigInt string format (${stringedMethodId}) stored as methodId`);
    }
  };
  const checkerCell = beginCell()
    .storeInt(methodId(), 32)
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
