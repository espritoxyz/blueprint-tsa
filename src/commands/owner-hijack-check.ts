import { CommandModule, InferredOptionTypes, Options } from "yargs";
import { existsSync } from "fs";
import { beginCell, getMethodId } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { TreeProperty } from "../common/draw.js";
import { CommandContext } from "../cli.js";
import { ReproduceParameters } from "../reproduce/network.js";
import { ConcreteAnalysisConfig } from "../reproduce/concrete-analysis.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import { writeReproduceConfig } from "../reproduce/build-config.js";
import {
  Sym,
  OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME,
  OWNER_HIJACK_CHECK_ID,
  OWNER_HIJACK_CHECK_CONCRETE_FILENAME,
  ERROR_EXIT_CODE,
  OWNER_HIJACK_DESCRIPTION_URL,
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
import { OwnerHijackOptions } from "../reproduce/reproduce-config.js";

const ownerHijackCheckOptions = {
  "method-name": {
    alias: "m",
    type: "string",
    description: "The method name of get_owner getter",
    demandOption: true,
  },
  ...commonAnalyzerRecvInternalCliOptions,
} as const satisfies Record<string, Options>;

type OwnerHijackCheckSchema = InferredOptionTypes<
  typeof ownerHijackCheckOptions
>;

export const createOwnerHijackCheckCommand = (
  context: CommandContext,
): CommandModule<object, OwnerHijackCheckSchema> => {
  return {
    command: OWNER_HIJACK_CHECK_ID,
    describe: "Analyze contract for the possibility of owner hijack",
    builder: ownerHijackCheckOptions,
    handler: async (argv: OwnerHijackCheckSchema) => {
      await ownerHijackCheckCommand(context.ui, argv);
    },
  };
};

/**
 * Runs owner hijack check analysis and returns the analyzer wrapper
 * @param ui - UI provider
 * @param contractPath - Path to the compiled contract
 * @param methodId - Method ID of the owner getter
 * @param commonArgs - Common analyzer options (timeout, opcodes, verbose)
 * @param completionMessage
 * @returns AnalyzerWrapper instance
 */
export const runOwnerHijackCheckAnalysis = async (
  ui: UIProvider,
  contractPath: string,
  methodId: bigint,
  commonArgs: CommonAnalyzerRecvInternalArgs,
  completionMessage: string = "Analysis complete",
): Promise<AnalyzerWrapper> => {
  const contractName = commonArgs.contract;
  const checkerPath = getCheckerPath(OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME);

  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "TON owner hijack" },
    {
      key: "Options",
      separator: true,
      children: [
        ...generateOptionsForPropertyTree(commonArgs),
        { key: "Method id", value: methodId.toString() },
      ],
    },
  ];

  const checkerCell = beginCell().storeUint(methodId, 32).endCell();
  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
    codePath: contractPath,
    legacyAnalysisArtifacts: commonArgs.legacyAnalysisArtifacts,
  });
  const reportDir = getReportDirectory(analyzer.id);
  const sarifPath = getSarifReportPath(analyzer.id);

  await analyzer.run(
    OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME,
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
      "--disable-out-message-analysis",
      ...generateFlagsFromCommonRecvInternalArgs(commonArgs),
    ],
    completionMessage,
  );

  // Write reproduction config if vulnerability is found
  const vulnerability = analyzer.getVulnerabilityFromReport();
  if (vulnerability) {
    writeReproduceConfig(
      vulnerability,
      OWNER_HIJACK_CHECK_ID,
      commonArgs.timeout,
      analyzer.id,
      {
        kind: "owner-hijack-check",
        methodId: methodId.toString(),
      },
      commonArgs.iterationLimit,
      commonArgs.recursionLimit,
    );
  }

  return analyzer;
};

const ownerHijackCheckCommand = async (
  ui: UIProvider,
  parsedArgs: OwnerHijackCheckSchema,
) => {
  const contractName = parsedArgs.contract;
  const methodId = BigInt(getMethodId(parsedArgs["method-name"]));

  await buildAllContracts(ui);
  const contractPath = resolveBuiltContract(ui, contractName);

  const { opcodes, timeout } = await resolveOpcodesAndTimeout(
    ui,
    contractName,
    contractPath,
    {
      disableOpcodeExtraction: parsedArgs["disable-opcode-extraction"],
      explicitTimeout: parsedArgs.timeout,
      commandLabel: OWNER_HIJACK_CHECK_ID,
      interactive: parsedArgs.interactive,
    },
  );

  if (!hasExplicitTimeout(parsedArgs.timeout)) {
    await confirmLongRunningAnalysis(ui, {
      commandLabel: OWNER_HIJACK_CHECK_ID,
      contractName,
      timeoutSeconds: timeout,
      opcodeCount: opcodes.length,
      checkCount: 1,
      interactive: parsedArgs.interactive,
    });
  }

  const analyzer = await runOwnerHijackCheckAnalysis(
    ui,
    contractPath,
    methodId,
    {
      timeout,
      opcodes,
      verbose: parsedArgs.verbose,
      contract: contractName,
      iterationLimit: parsedArgs[ITERATION_LIMIT_OPTION],
      recursionLimit: parsedArgs[RECURSION_LIMIT_OPTION],
      interactive: parsedArgs.interactive,
      legacyAnalysisArtifacts: parsedArgs[VERBOSE_ANALYSIS_ARTIFACTS_OPTION],
    },
  );
  reportAndExit(ui, analyzer, OWNER_HIJACK_DESCRIPTION_URL);
};

export const ownerHijackCheckConcrete = async (
  ui: UIProvider,
  config: ConcreteAnalysisConfig,
  concreteCheckerOptions: OwnerHijackOptions,
  completionMessage: string = "Analysis complete",
): Promise<ReproduceParameters | null> => {
  if (!existsSync(config.codePath)) {
    ui.write(`\n${Sym.ERR} Code at ${config.codePath} not found`);
    process.exit(1);
  }

  const timeout = config.timeout;

  const parseMethodId = (stringedMethodId: string): bigint => {
    try {
      return BigInt(stringedMethodId);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
      throw new Error(
        `Invalid BigInt string format (${stringedMethodId}) stored as methodId`,
      );
    }
  };
  const methodId = parseMethodId(concreteCheckerOptions.methodId);

  const properties: TreeProperty[] = [
    { key: "Contract", value: config.contractAddress.toRawString() },
    { key: "Mode", value: "TON owner hijack reproduction" },
    {
      key: "Options",
      separator: true,
      children: [
        {
          key: "Timeout",
          value: timeout !== null ? `${timeout} seconds` : "not set",
        },
        { key: "Method id", value: methodId.toString() },
        { key: "Sender", value: config.senderAddress.toRawString() },
      ],
    },
  ];

  const maxTons = await readNanotons(
    "Enter maximum amount of TONs for reproduction message:",
    ui,
  );

  const checkerPath = getCheckerPath(OWNER_HIJACK_CHECK_CONCRETE_FILENAME);
  const checkerCell = beginCell()
    .storeUint(methodId, 32)
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

  await analyzer.run(
    OWNER_HIJACK_CHECK_CONCRETE_FILENAME,
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
      "--disable-out-message-analysis",
      "--exported-inputs",
      getReportDirectory(wrapper.id),
      ...(config.timeout != null
        ? ["--timeout", config.timeout.toString()]
        : []),
      "-v",
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
