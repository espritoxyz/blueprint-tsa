import { CommandModule, InferredOptionTypes, Options } from "yargs";
import path from "path";
import { CommandContext } from "../cli.js";
import {
  OPCODE_INFO,
  Sym,
  ERROR_EXIT_CODE,
  OPCODE_AUTHORIZATION_CHECK_FILENAME,
  OPCODE_INFO_DESCRIPTION_URL,
} from "../common/constants.js";
import { UIProvider } from "@ton/blueprint";
import { extractOpcodes } from "../common/opcode-extractor.js";
import { buildAllContracts } from "../common/build-utils.js";
import {
  findCompiledContract,
  getSarifReportPath,
  getCheckerPath,
  getReportDirectory,
  getInputsPath,
  getCompactTypedInputPath,
} from "../common/paths.js";
import { existsSync } from "fs";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import { beginCell } from "@ton/core";
import { TreeProperty } from "../common/draw.js";
import { formatOpcodeHex } from "../common/format-utils.js";
import { findNonFailingExecution } from "../common/result-parsing.js";
import {
  commonAnalyzerCliOptions,
  CommonAnalyzerArgs,
  generateFlagsFromCommonArgs,
  generateOptionsForPropertyTree,
  ITERATION_LIMIT_OPTION,
  RECURSION_LIMIT_OPTION,
  VERBOSE_ANALYSIS_ARTIFACTS_OPTION,
} from "./common-analyzer-args.js";
import {
  confirmLongRunningAnalysis,
  confirmOpcodeExtractionWait,
} from "./command-utils.js";

export interface OpcodeInfo {
  opcode: number;
  withAuthorization: boolean;
  vulnerabilityPath?: string;
}

const DEFAULT_OPCODE_TIMEOUT_SECONDS = 60;
const OPCODE_TIMEOUT_OPTION_DESCRIPTION =
  "Analysis timeout in seconds for one opcode authorization check";

const opcodeInfoCliOptions = {
  ...commonAnalyzerCliOptions,
  timeout: {
    ...commonAnalyzerCliOptions.timeout,
    default: DEFAULT_OPCODE_TIMEOUT_SECONDS,
    description: OPCODE_TIMEOUT_OPTION_DESCRIPTION,
  },
} as const satisfies Record<string, Options>;

type OpcodeInfoSchema = InferredOptionTypes<typeof opcodeInfoCliOptions>;

export const createOpcodeInfoCommand = (
  context: CommandContext,
): CommandModule<object, OpcodeInfoSchema> => {
  return {
    command: OPCODE_INFO,
    describe: "Display information about contract opcodes",
    builder: opcodeInfoCliOptions,
    handler: async (argv: OpcodeInfoSchema) => {
      await opcodeInfoHandler(context, argv);
    },
  };
};

export async function runOpcodeAuthorizationCheckAnalysis(
  opcode: number,
  contractPath: string,
  ui: UIProvider,
  commonArgs: CommonAnalyzerArgs,
  completionMessage: string = "Analysis complete.",
): Promise<OpcodeInfo | null> {
  const contractName = commonArgs.contract;

  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "Opcode Authorization Check" },
    {
      key: "Options",
      separator: true,
      children: [
        {
          key: "Opcode",
          value: formatOpcodeHex(opcode),
        },
        ...generateOptionsForPropertyTree(commonArgs),
      ],
    },
  ];

  const checkerPath = getCheckerPath(OPCODE_AUTHORIZATION_CHECK_FILENAME);
  const checkerCell = beginCell().storeUint(opcode, 32).endCell();

  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
    codePath: contractPath,
    interactive: commonArgs.interactive ?? true,
    legacyAnalysisArtifacts: commonArgs.legacyAnalysisArtifacts,
  });

  const sarifPath = getSarifReportPath(analyzer.id);

  await analyzer.run(
    OPCODE_AUTHORIZATION_CHECK_FILENAME,
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
      "--disable-out-message-analysis",
      "--exported-inputs",
      getReportDirectory(wrapper.id),
      ...generateFlagsFromCommonArgs(commonArgs),
    ],
    completionMessage,
  );

  const vulnerability = existsSync(sarifPath)
    ? analyzer.vulnerabilityIsPresent()
    : false;
  const nonFailingExecutionIndex = existsSync(sarifPath)
    ? findNonFailingExecution(sarifPath)
    : undefined;

  if (nonFailingExecutionIndex === undefined && !vulnerability) {
    return null;
  }

  const withAuthorization = !vulnerability;
  let vulnerabilityPath: string | undefined;
  if (vulnerability) {
    const vulnDesc = analyzer.getVulnerabilityFromReport();
    if (vulnDesc) {
      vulnerabilityPath = commonArgs.legacyAnalysisArtifacts
        ? getInputsPath(analyzer.id, vulnDesc.executionIndex)
        : getCompactTypedInputPath(analyzer.id);
    }
  }

  return {
    opcode,
    withAuthorization,
    vulnerabilityPath,
  };
}

async function extractOpcodeInfo(
  opcode: number,
  contractPath: string,
  ui: UIProvider,
  commonArgs: CommonAnalyzerArgs,
): Promise<OpcodeInfo | null> {
  return runOpcodeAuthorizationCheckAnalysis(
    opcode,
    contractPath,
    ui,
    commonArgs,
    "Analysis complete.",
  );
}

async function getAllOpcodeInfo(
  opcodes: number[],
  contractPath: string,
  ui: UIProvider,
  commonArgs: CommonAnalyzerArgs,
): Promise<OpcodeInfo[]> {
  const results: OpcodeInfo[] = [];
  for (const opcode of opcodes) {
    const info = await extractOpcodeInfo(opcode, contractPath, ui, commonArgs);
    if (info !== null) {
      results.push(info);
    }
  }
  return results;
}

export function formatOpcodeInfo(infos: OpcodeInfo[]): string {
  if (infos.length === 0) {
    return "No opcodes to analyze.";
  }

  const lines: string[] = ["Opcode Authorization Analysis:", ""];

  let hasUnauthorizedOpcodes = false;
  for (const info of infos) {
    const opcodeHex = formatOpcodeHex(info.opcode);
    const authStatus = info.withAuthorization
      ? `${Sym.OK} Has authorization checks`
      : `${Sym.WARN} No authorization checks`;
    lines.push(`${opcodeHex}: ${authStatus}`);

    // If authorization is missing and vulnerability path is available, show it
    if (!info.withAuthorization && info.vulnerabilityPath) {
      const relativePath = path.relative(process.cwd(), info.vulnerabilityPath);
      lines.push(`  Path to reproducing input: ${relativePath}`);
      hasUnauthorizedOpcodes = true;
    }

    lines.push("");
  }

  // Add description URL if any opcodes lack authorization
  if (hasUnauthorizedOpcodes) {
    lines.push(`Description: ${OPCODE_INFO_DESCRIPTION_URL}`);
  }

  lines.push("");
  return lines.join("\n");
}

const opcodeInfoHandler = async (
  context: CommandContext,
  args: OpcodeInfoSchema,
) => {
  const { ui } = context;
  const { timeout, contract, verbose } = args;

  await buildAllContracts(ui, args.interactive as boolean);
  const codePath = findCompiledContract(contract as string);

  if (!existsSync(codePath)) {
    ui.write(`\n${Sym.ERR} Contract ${contract} not found`);
    process.exit(1);
  }

  await confirmOpcodeExtractionWait(ui, {
    commandLabel: OPCODE_INFO,
    contractName: contract as string,
    interactive: args.interactive as boolean,
  });

  const opcodes = await extractOpcodes({
    ui,
    codePath,
    contractName: contract as string,
    interactive: args.interactive as boolean,
  });

  if (opcodes.length === 0) {
    ui.write("");
    ui.write(`${Sym.WARN} No opcodes found in contract`);
    return;
  }

  const perOpcodeTimeout =
    (timeout as number) ?? DEFAULT_OPCODE_TIMEOUT_SECONDS;
  const totalTimeout = perOpcodeTimeout * opcodes.length;
  const commonArgs: CommonAnalyzerArgs = {
    timeout: perOpcodeTimeout,
    verbose: verbose as boolean,
    contract: contract as string,
    iterationLimit: args[ITERATION_LIMIT_OPTION] as number,
    recursionLimit: args[RECURSION_LIMIT_OPTION] as number,
    interactive: args.interactive as boolean,
    legacyAnalysisArtifacts: args[VERBOSE_ANALYSIS_ARTIFACTS_OPTION] as boolean,
  };

  await confirmLongRunningAnalysis(ui, {
    commandLabel: OPCODE_INFO,
    contractName: contract as string,
    timeoutSeconds: totalTimeout,
    opcodeCount: opcodes.length,
    checkCount: opcodes.length,
    interactive: args.interactive as boolean,
  });

  const infos = await getAllOpcodeInfo(opcodes, codePath, ui, commonArgs);

  ui.write("");
  const output = formatOpcodeInfo(infos);
  ui.write(output);
};
