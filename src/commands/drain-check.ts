import { CommandModule, InferredOptionTypes } from "yargs";
import { existsSync } from "fs";
import { beginCell, toNano } from "@ton/core";
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
import { buildContracts } from "../common/build-utils.js";
import {
  printCleanupInstructions,
  printReproductionInstructions,
} from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
} from "../common/paths.js";
import { extractOpcodes } from "../common/opcode-extractor.js";
import {
  CommonAnalyzerOptions,
  generateFlagsFromCommonOptions,
} from "./common-analyzer-options.js";

const ONE_MINUTE_SECONDS = 60;

const drainCheckOptions = {
  timeout: {
    alias: "t",
    type: "number",
    description: "Analysis timeout in seconds",
  },
  contract: {
    alias: "c",
    type: "string",
    description: "Contract name",
    demandOption: true,
  },
  "disable-opcode-extraction": {
    type: "boolean",
    description:
      "Disable opcode extraction. This affects path selection strategy and default timeout.",
  },
  verbose: {
    alias: "v",
    type: "boolean",
    description: "Use debug output in TSA log",
  },
} as const;

type DrainCheckSchema = InferredOptionTypes<typeof drainCheckOptions>;

export const createDrainCheckCommand = (
  context: CommandContext,
): CommandModule<object, DrainCheckSchema> => {
  return {
    command: DRAIN_CHECK_ID,
    describe: "Analyze contract for drain vulnerabilities",
    builder: drainCheckOptions,
    handler: async (argv: DrainCheckSchema) => {
      await drainCheckCommand(context, argv);
    },
  };
};

/**
 * Runs drain check analysis and returns the analyzer wrapper
 * @param contractName - Name of the contract
 * @param contractPath - Path to the compiled contract
 * @param ui - UI provider
 * @param commonOptions
 * @param completionMessage
 * @returns AnalyzerWrapper instance
 */
export const runDrainCheckAnalysis = async (
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  commonOptions: CommonAnalyzerOptions,
  completionMessage: string = "Analysis complete",
): Promise<AnalyzerWrapper> => {
  const checkerPath = getCheckerPath(DRAIN_CHECK_SYMBOLIC_FILENAME);

  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "TON drain" },
    {
      key: "Options",
      separator: true,
      children: [
        {
          key: "Timeout",
          value:
            commonOptions.timeout !== null
              ? `${commonOptions.timeout} seconds`
              : "not set",
        },
      ],
    },
  ];
  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell: beginCell().endCell(),
    properties,
    codePath: contractPath,
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
      ...generateFlagsFromCommonOptions(commonOptions),
    ],
    completionMessage,
  );

  // Write reproduction config if vulnerability is found
  const vulnerability = analyzer.getVulnerability();
  if (vulnerability) {
    writeReproduceConfig(
      vulnerability,
      DRAIN_CHECK_ID,
      commonOptions.timeout,
      analyzer.id,
      {
        kind: DRAIN_CHECK_ID,
      },
    );
  }

  return analyzer;
};

const drainCheckCommand = async (
  context: CommandContext,
  parsedArgs: DrainCheckSchema,
) => {
  const { ui } = context;

  await buildContracts(ui);
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

  const analyzer = await runDrainCheckAnalysis(contract, contractPath, ui, {
    timeout,
    opcodes,
    verbose: parsedArgs.verbose,
  });

  const vulnerability = analyzer.getVulnerability();
  analyzer.reportVulnerability(vulnerability, DRAIN_DESCRIPTION_URL);

  printCleanupInstructions(ui);

  if (vulnerability != null) {
    printReproductionInstructions(ui, analyzer.id);

    process.exit(2);
  }
};

export const drainCheckConcrete = async (
  config: ConcreteAnalysisConfig,
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

  const maxTons = toNano(
    await ui.input("Enter maximum amount of TONs for reproduction message:"),
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
