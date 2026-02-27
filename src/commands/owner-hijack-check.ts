import { Argv } from "yargs";
import { existsSync } from "fs";
import { beginCell, getMethodId, toNano } from "@ton/core";
import { TreeProperty } from "../common/draw.js";
import { CommandContext, CommandHandler } from "../cli.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import { writeReproduceConfig } from "../reproduce/build-config.js";
import {
  ERROR_EXIT_CODE,
  OWNER_HIJACK_CHECK_CONCRETE_FILENAME,
  OWNER_HIJACK_CHECK_ID,
  OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME,
  Sym,
  OWNER_HIJACK_DESCRIPTION_URL,
} from "../common/constants.js";
import { buildContracts } from "../common/build-utils.js";
import {
  printCleanupInstructions,
  printReproductionInstructions,
} from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getReportDirectory,
  getSarifReportPath,
} from "../common/paths.js";
import { UIProvider } from "@ton/blueprint";
import { ConcreteAnalysisConfig } from "../reproduce/concrete-analysis.js";
import { ReproduceParameters } from "../reproduce/network.js";
import { OwnerHijackOptions } from "../reproduce/reproduce-config.js";
import { extractOpcodes } from "../common/opcode-extractor.js";

const ONE_MINUTE_SECONDS = 60;

export const configureOwnerHijackCommand = (context: CommandContext): any => ({
  command: OWNER_HIJACK_CHECK_ID,
  description: "Analyze contract for the possibility of owner hijack",
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
      .option("method-name", {
        alias: "m",
        type: "string",
        description: "The method name of get_owner getter",
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
  handler: async (argv: any) => await ownerHijackCommand(context, argv),
});

const extractOptions = (ui: UIProvider, parsedArgs: any) => {
  const contract = parsedArgs.contract;
  if (typeof contract !== "string") {
    throw new Error("Contract name or path is required");
  }

  const timeout: number | null = parsedArgs.timeout ?? null;
  const methodid = getMethodId(parsedArgs.methodName);

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
    { key: "Contract", value: options.contract },
    { key: "Mode", value: "TON owner hijack" },
    {
      key: "Options",
      separator: true,
      children: [
        {
          key: "Timeout",
          value:
            options.timeout !== null ? `${options.timeout} seconds` : "not set",
        },
        { key: "Method id", value: options.methodId.toString() },
      ],
    },
  ];
  return { options, properties };
};

/**
 * Runs owner hijack check analysis and returns the analyzer wrapper
 * @param contractName - Name of the contract
 * @param contractPath - Path to the compiled contract
 * @param ui - UI provider
 * @param timeout - Analysis timeout in seconds
 * @param methodId - Method ID of the owner getter
 * @param opcodes - List of opcodes to analyze
 * @param verbose - Enable verbose output
 * @returns AnalyzerWrapper instance
 */
export const runOwnerHijackCheckAnalysis = async (
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  methodId: bigint,
  opcodes: number[],
  verbose: boolean = false,
  completionMessage: string = "Analysis complete.",
): Promise<AnalyzerWrapper> => {
  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "TON owner hijack" },
    {
      key: "Options",
      separator: true,
      children: [
        {
          key: "Timeout",
          value: timeout !== null ? `${timeout} seconds` : "not set",
        },
        { key: "Method id", value: methodId.toString() },
      ],
    },
  ];

  const checkerPath = getCheckerPath(OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME);
  const checkerCell = beginCell().storeUint(methodId, 32).endCell();
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
      ...(verbose ? ["-v"] : []),
      ...opcodes.flatMap((opcode) => ["--opcode", opcode.toString()]),
      "--disable-out-message-analysis",
      ...(timeout != null ? ["--timeout", timeout.toString()] : []),
    ],
    completionMessage,
  );

  // Write reproduction config if vulnerability is found
  const vulnerability = analyzer.getVulnerability();
  if (vulnerability) {
    writeReproduceConfig(
      vulnerability,
      OWNER_HIJACK_CHECK_ID,
      timeout,
      analyzer.id,
      {
        kind: "owner-hijack-check",
        methodId: methodId.toString(),
      },
    );
  }

  return analyzer;
};

const ownerHijackCommand: CommandHandler = async (
  context: CommandContext,
  parsedArgs: any,
) => {
  const { ui } = context;
  await buildContracts(ui);
  const { options, properties } = extractOptions(ui, parsedArgs);

  const contractPath = findCompiledContract(options.contract);
  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${options.contract} not found`);
    process.exit(1);
  }

  let opcodes: number[] = [];
  if (!parsedArgs["disable-opcode-extraction"]) {
    opcodes = await extractOpcodes({
      ui,
      codePath: contractPath,
      contractName: options.contract,
    });
  }

  // If timeout wasn't provided, set it to 1 minute * (number_of_opcodes + 1)
  if (options.timeout === null && opcodes.length > 0) {
    options.timeout = ONE_MINUTE_SECONDS * (opcodes.length + 1);
    ui.write("");
    ui.write(
      "The timeout was calculated automatically based on the number of opcodes.",
    );
  }

  // Update properties to reflect the calculated timeout
  const timeoutProperty = properties[2].children?.find(
    (p) => p.key === "Timeout",
  );
  if (timeoutProperty) {
    timeoutProperty.value =
      options.timeout !== null ? `${options.timeout} seconds` : "not set";
  }

  const analyzer = await runOwnerHijackCheckAnalysis(
    options.contract,
    contractPath,
    ui,
    options.timeout,
    options.methodId,
    opcodes,
    parsedArgs.verbose,
  );

  const vulnerability = analyzer.getVulnerability();
  analyzer.reportVulnerability(vulnerability, OWNER_HIJACK_DESCRIPTION_URL);

  printCleanupInstructions(ui);

  if (vulnerability != null) {
    printReproductionInstructions(ui, analyzer.id);

    process.exit(2);
  }
};

const readNanotons = async (
  request: string,
  ui: UIProvider,
): Promise<bigint> => {
  while (true) {
    const userInput = await ui.input(request);
    try {
      return toNano(userInput);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      ui.write(
        `Your input (${userInput}) was of not correct nanoton format. Please try again.`,
      );
    }
  }
};

export const ownerHijackCheckConcrete = async (
  config: ConcreteAnalysisConfig,
  concreteCheckerOptions: OwnerHijackOptions,
  completionMessage: string = "Analysis complete.",
): Promise<ReproduceParameters | null> => {
  const { ui } = config;

  if (!existsSync(config.codePath)) {
    ui.write(`\n${Sym.ERR} Code at ${config.codePath} not found`);
    process.exit(1);
  }

  const timeout = config.timeout;

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
        {
          key: "Method id",
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

  const checkerPath = getCheckerPath(OWNER_HIJACK_CHECK_CONCRETE_FILENAME);
  const getMethodId = () => {
    const stringedMethodId = concreteCheckerOptions.methodId;
    try {
      return BigInt(stringedMethodId);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
      throw new Error(
        `Invalid BigInt string format (${stringedMethodId}) stored as methodId`,
      );
    }
  };
  const methodId = getMethodId();
  console.log(
    `methodId=${methodId} maxTons=${maxTons} address=${config.senderAddress.toRawString()}`,
  );
  const checkerCell = beginCell()
    .storeInt(methodId, 32)
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

  const vulnerability = analyzer.getVulnerability();
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
