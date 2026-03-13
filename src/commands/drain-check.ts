import { CommandModule, InferredOptionTypes, Options } from "yargs";
import { existsSync } from "fs";
import { beginCell } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { TreeProperty } from "../common/draw.js";
import { CommandContext } from "../cli.js";
import { ReproduceParameters } from "../reproduce/network.js";
import { ConcreteAnalysisConfig } from "../reproduce/concrete-analysis.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import { writeReproduceConfig } from "../reproduce/build-config.js";
import {
  Sym,
  DRAIN_CHECK_SYMBOLIC_FILENAME,
  DRAIN_CHECK_ID,
  DRAIN_CHECK_CONCRETE_FILENAME,
  ERROR_EXIT_CODE,
  DRAIN_DESCRIPTION_URL,
} from "../common/constants.js";
import { buildAllContracts } from "../common/build-utils.js";
import {
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
} from "../common/paths.js";
import {
  CommonAnalyzerRecvInternalArgs,
  commonAnalyzerRecvInternalCliOptions,
  generateFlagsFromCommonRecvInternalArgs,
  generateOptionsForPropertyTree,
  ITERATION_LIMIT_OPTION,
  RECURSION_LIMIT_OPTION,
  VERBOSE_ANALYSIS_ARTIFACTS_OPTION,
} from "./common-analyzer-args.js";
import {
  resolveBuiltContract,
  resolveOpcodesAndTimeout,
  reportAndExit,
  readNanotons,
  confirmLongRunningAnalysis,
  hasExplicitTimeout,
} from "./command-utils.js";

const drainCheckOptions = {
  ...commonAnalyzerRecvInternalCliOptions,
} as const satisfies Record<string, Options>;

type DrainCheckSchema = InferredOptionTypes<typeof drainCheckOptions>;

export const createDrainCheckCommand = (
  context: CommandContext,
): CommandModule<object, DrainCheckSchema> => {
  return {
    command: DRAIN_CHECK_ID,
    describe: "Analyze contract for drain vulnerabilities",
    builder: drainCheckOptions,
    handler: async (argv: DrainCheckSchema) => {
      await drainCheckCommand(context.ui, argv);
    },
  };
};

/**
 * Runs drain check analysis and returns the analyzer wrapper
 * @param ui - UI provider
 * @param contractPath - Path to the compiled contract
 * @param commonArgs
 * @param completionMessage
 * @returns AnalyzerWrapper instance
 */
export const runDrainCheckAnalysis = async (
  ui: UIProvider,
  contractPath: string,
  commonArgs: CommonAnalyzerRecvInternalArgs,
  completionMessage: string = "Analysis complete",
): Promise<AnalyzerWrapper> => {
  const contractName = commonArgs.contract;
  const checkerPath = getCheckerPath(DRAIN_CHECK_SYMBOLIC_FILENAME);

  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "TON drain" },
    {
      key: "Options",
      separator: true,
      children: [...generateOptionsForPropertyTree(commonArgs)],
    },
  ];
  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell: beginCell().endCell(),
    properties,
    codePath: contractPath,
    interactive: commonArgs.interactive ?? true,
    legacyAnalysisArtifacts: commonArgs.legacyAnalysisArtifacts,
  });
  const reportDir = getReportDirectory(analyzer.id);
  const sarifPath = getSarifReportPath(analyzer.id);

  await analyzer.run(
    DRAIN_CHECK_SYMBOLIC_FILENAME,
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
      "--exported-inputs",
      reportDir,
      ...generateFlagsFromCommonRecvInternalArgs(commonArgs),
    ],
    completionMessage,
  );

  // Write reproduction config if vulnerability is found
  const vulnerability = analyzer.getVulnerabilityFromReport();
  if (vulnerability) {
    writeReproduceConfig(
      vulnerability,
      DRAIN_CHECK_ID,
      commonArgs.timeout,
      analyzer.id,
      {
        kind: DRAIN_CHECK_ID,
      },
      commonArgs.iterationLimit,
      commonArgs.recursionLimit,
    );
  }

  return analyzer;
};

const drainCheckCommand = async (
  ui: UIProvider,
  parsedArgs: DrainCheckSchema,
) => {
  const contractName = parsedArgs.contract;

  await buildAllContracts(ui, parsedArgs.interactive);
  const contractPath = resolveBuiltContract(ui, contractName);

  const { opcodes, timeout } = await resolveOpcodesAndTimeout(
    ui,
    contractName,
    contractPath,
    {
      disableOpcodeExtraction: parsedArgs["disable-opcode-extraction"],
      explicitTimeout: parsedArgs.timeout,
      commandLabel: DRAIN_CHECK_ID,
      interactive: parsedArgs.interactive,
    },
  );

  if (!hasExplicitTimeout(parsedArgs.timeout)) {
    await confirmLongRunningAnalysis(ui, {
      commandLabel: DRAIN_CHECK_ID,
      contractName,
      timeoutSeconds: timeout,
      opcodeCount: opcodes.length,
      checkCount: 1,
      interactive: parsedArgs.interactive,
    });
  }

  const commonArgs: CommonAnalyzerRecvInternalArgs = {
    timeout,
    opcodes,
    verbose: parsedArgs.verbose,
    contract: contractName,
    iterationLimit: parsedArgs[ITERATION_LIMIT_OPTION],
    recursionLimit: parsedArgs[RECURSION_LIMIT_OPTION],
    legacyAnalysisArtifacts: parsedArgs[VERBOSE_ANALYSIS_ARTIFACTS_OPTION],
  };

  const analyzer = await runDrainCheckAnalysis(ui, contractPath, commonArgs);

  reportAndExit(ui, analyzer, DRAIN_DESCRIPTION_URL);
};

export const drainCheckConcrete = async (
  ui: UIProvider,
  config: ConcreteAnalysisConfig,
  completionMessage: string = "Analysis complete",
): Promise<ReproduceParameters | null> => {
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
        {
          key: "Timeout",
          value: timeout !== null ? `${timeout} seconds` : "not set",
        },
        { key: "Sender", value: config.senderAddress.toRawString() },
      ],
    },
  ];

  const maxTons = await readNanotons(
    "Enter maximum amount of TONs for reproduction message:",
    ui,
  );

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
    interactive: true,
  });

  await analyzer.run(
    DRAIN_CHECK_CONCRETE_FILENAME,
    (wrapper) => [
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
      ...(config.timeout != null
        ? ["--timeout", config.timeout.toString()]
        : []),
      ...(config.iterationLimit != null
        ? ["--iteration-limit", config.iterationLimit.toString()]
        : []),
      ...(config.recursionLimit != null
        ? ["--max-recursion-depth", config.recursionLimit.toString()]
        : []),
    ],
    completionMessage,
  );

  const vulnerability = analyzer.getVulnerabilityFromReport();
  if (vulnerability == null) {
    ui.write(
      `${Sym.WARN} Vulnerability couldn't be reproduced with concrete data.`,
    );
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
