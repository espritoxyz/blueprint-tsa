import { TreeProperty } from "../common/draw.js";
import { Options } from "yargs";

export interface CommonAnalyzerArgs {
  timeout: number | null;
  verbose?: boolean;
  contract: string;
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
  ];
}

export function generateFlagsFromCommonRecvInternalArgs(
  commonArgs: CommonAnalyzerRecvInternalArgs,
): string[] {
  return [
    ...(commonArgs.timeout != null
      ? ["--timeout", commonArgs.timeout.toString()]
      : []),
    ...(commonArgs.verbose ? ["-v"] : []),
    ...commonArgs.opcodes.flatMap((opcode) => ["--opcode", opcode.toString()]),
  ];
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
} as const satisfies Record<string, Options>;

export const commonAnalyzerRecvInternalCliOptions = {
  ...commonAnalyzerCliOptions,
  "disable-opcode-extraction": {
    type: "boolean",
    description:
      "Disable opcode extraction. This affects path selection strategy and default timeout.",
  },
} as const satisfies Record<string, Options>;
