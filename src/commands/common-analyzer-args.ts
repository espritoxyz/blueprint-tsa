import { TreeProperty } from "../common/draw.js";
import { Options } from "yargs";

export interface CommonAnalyzerArgs {
  timeout: number | null;
  verbose?: boolean;
  contract: string;
  iterationLimit: number | null;
  recursionLimit: number | null;
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
    ...(commonArgs.iterationLimit
      ? ["--iteration-limit", commonArgs.iterationLimit.toString()]
      : []),
    ...(commonArgs.recursionLimit
      ? ["--max-recursion-depth", commonArgs.recursionLimit.toString()]
      : []),
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
      value:
        commonArgs.iterationLimit !== null
          ? commonArgs.iterationLimit.toString()
          : "not set",
    },
    {
      key: "Recursion Limit",
      value:
        commonArgs.recursionLimit !== null
          ? commonArgs.recursionLimit.toString()
          : "not set",
    },
  ];
}

export const commonAnalyzerCliOptions = {
  timeout: {
    alias: "t",
    type: "number",
    description: "Analysis timeout in seconds",
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
  "iteration-limit": {
    type: "number",
    description: "Iteration limit",
  },
  "recursion-limit": {
    type: "number",
    description: "Recursion limit",
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
