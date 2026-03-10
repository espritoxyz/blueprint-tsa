import { TreeProperty } from "../common/draw.js";
import { Options } from "yargs";
import {
  DEFAULT_ITERATION_LIMIT,
  DEFAULT_RECURSION_LIMIT,
} from "../common/constants.js";

export const ITERATION_LIMIT_OPTION = "iteration-limit";
export const RECURSION_LIMIT_OPTION = "max-recursion-depth";
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
}

export interface CommonAnalyzerRecvInternalArgs extends CommonAnalyzerArgs {
  opcodes: number[];
}

export function generateFlagsFromCommonArgs(
  commonArgs: CommonAnalyzerArgs,
): string[] {
  return [
    ...(commonArgs.timeout != null
      ? ["--timeout", commonArgs.timeout.toString()]
      : []),
    ...(commonArgs.verbose ? ["-v"] : []),
    ...[`--${ITERATION_LIMIT_OPTION}`, commonArgs.iterationLimit.toString()],
    ...["--max-recursion-depth", commonArgs.recursionLimit.toString()],
  ];
}

export function generateFlagsFromCommonRecvInternalArgs(
  commonArgs: CommonAnalyzerRecvInternalArgs,
): string[] {
  return generateFlagsFromCommonArgs(commonArgs).concat([
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
    description: "Contract name",
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
