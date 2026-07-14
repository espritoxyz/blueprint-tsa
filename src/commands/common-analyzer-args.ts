import path from "path";
import { TreeProperty } from "../common/draw.js";
import { Options } from "yargs";
import {
  DEFAULT_ITERATION_LIMIT,
  DEFAULT_RECURSION_LIMIT,
} from "../common/constants.js";

export const ITERATION_LIMIT_OPTION = "iteration-limit";
export const RECURSION_LIMIT_OPTION = "max-recursion-depth";
export const BALANCE_OPTION = "balance";
export const DATA_OPTION = "data";
// TSA treats '-' as an unconstrained (symbolic) value
const UNCONSTRAINED_OPTION_FLAG_VALUE = "-";
export const VERBOSE_ANALYSIS_ARTIFACTS_OPTION = "verbose-analysis-artifacts";
export const DEFAULT_TIMEOUT_OPTION_DESCRIPTION =
  "Overall analysis timeout in seconds";

export interface CommonAnalyzerArgs {
  timeout: number | null;
  verbose?: boolean;
  contract: string;
  iterationLimit: number;
  recursionLimit: number;
  interactive?: boolean;
  legacyAnalysisArtifacts?: boolean;
  /** Concrete contract balance in nanotons; null/undefined keeps the balance symbolic */
  balance?: bigint | null;
  /** Path to a .boc file with concrete contract data; null/undefined keeps the data symbolic */
  data?: string | null;
}

export interface CommonAnalyzerRecvInternalArgs extends CommonAnalyzerArgs {
  opcodes: number[];
}

/**
 * Generates per-contract option flags (e.g. `--balance`, `--data`) for the
 * analyzed contracts.
 *
 * TSA requires the number of such options to either be zero or match the
 * number of `--contract` options, so when a concrete value is set for the
 * contract under test, auxiliary contracts get an unconstrained value.
 *
 * @param optionName - Name of the TSA option
 * @param value - Concrete value for the contract under test, if any
 * @param analyzedContractCount - Number of `--contract` options passed to TSA
 */
function generatePerContractOptionFlags(
  optionName: string,
  value: string | null | undefined,
  analyzedContractCount: number,
): string[] {
  if (value == null) {
    return [];
  }
  const flags = [`--${optionName}`, value];
  for (let i = 1; i < analyzedContractCount; i++) {
    flags.push(`--${optionName}`, UNCONSTRAINED_OPTION_FLAG_VALUE);
  }
  return flags;
}

export function generateFlagsFromCommonArgs(
  commonArgs: CommonAnalyzerArgs,
  analyzedContractCount: number = 1,
): string[] {
  return [
    ...(commonArgs.timeout != null
      ? ["--timeout", commonArgs.timeout.toString()]
      : []),
    ...(commonArgs.verbose ? ["-v"] : []),
    ...[`--${ITERATION_LIMIT_OPTION}`, commonArgs.iterationLimit.toString()],
    ...["--max-recursion-depth", commonArgs.recursionLimit.toString()],
    ...generatePerContractOptionFlags(
      BALANCE_OPTION,
      commonArgs.balance?.toString(),
      analyzedContractCount,
    ),
    ...generatePerContractOptionFlags(
      DATA_OPTION,
      commonArgs.data,
      analyzedContractCount,
    ),
  ];
}

export function generateFlagsFromCommonRecvInternalArgs(
  commonArgs: CommonAnalyzerRecvInternalArgs,
  analyzedContractCount: number = 1,
): string[] {
  return generateFlagsFromCommonArgs(commonArgs, analyzedContractCount).concat([
    ...commonArgs.opcodes.flatMap((opcode) => ["--opcode", opcode.toString()]),
  ]);
}

export function generateOptionsForPropertyTree(
  commonArgs: CommonAnalyzerArgs,
): TreeProperty[] {
  return [
    {
      key: "Timeout",
      value:
        commonArgs.timeout !== null
          ? `${commonArgs.timeout} seconds`
          : "not set",
    },
    {
      key: "Iteration Limit",
      value: commonArgs.iterationLimit.toString(),
    },
    {
      key: "Recursion Limit",
      value: commonArgs.recursionLimit.toString(),
    },
    {
      key: "Balance",
      value:
        commonArgs.balance != null
          ? `${commonArgs.balance} nanotons`
          : "symbolic (any value)",
    },
    {
      key: "Contract Data",
      value:
        commonArgs.data != null
          ? path.relative(process.cwd(), commonArgs.data)
          : "symbolic (any data)",
    },
  ];
}

export const commonAnalyzerCliOptions = {
  timeout: {
    alias: "t",
    type: "number",
    description: DEFAULT_TIMEOUT_OPTION_DESCRIPTION,
  },
  verbose: {
    alias: "v",
    type: "boolean",
    description: "Use debug output in TSA log",
  },
  contract: {
    alias: "c",
    type: "string",
    description:
      "Contract name: a project contract or a contract fetched from the blockchain (see fetch-contract)",
    demandOption: true,
  },
  [ITERATION_LIMIT_OPTION]: {
    type: "number",
    description: "Iteration limit",
    default: DEFAULT_ITERATION_LIMIT,
  },
  [RECURSION_LIMIT_OPTION]: {
    type: "number",
    description: "Recursion limit",
    default: DEFAULT_RECURSION_LIMIT,
  },
  [BALANCE_OPTION]: {
    alias: "b",
    type: "string",
    description:
      "Concrete contract balance in nanotons (default: the balance is symbolic)",
  },
  [DATA_OPTION]: {
    alias: "d",
    type: "string",
    description:
      "Path to a .boc file with concrete contract data (default: the data is symbolic)",
  },
  interactive: {
    type: "boolean",
    default: true,
    description: "Enable interactive confirmations",
  },
  [VERBOSE_ANALYSIS_ARTIFACTS_OPTION]: {
    type: "boolean",
    default: false,
    description:
      "Keep TSA exported inputs in the verbose multi-file directory layout",
  },
} as const satisfies Record<string, Options>;

export const commonAnalyzerRecvInternalCliOptions = {
  ...commonAnalyzerCliOptions,
  "disable-opcode-extraction": {
    type: "boolean",
    description:
      "Disable opcode extraction. This affects path selection strategy and default timeout.",
  },
} as const satisfies Record<string, Options>;
