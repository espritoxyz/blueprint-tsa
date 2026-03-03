import { TreeProperty } from "../common/draw.js";
import { Options } from "yargs";

export interface CommonAnalyzerOptions {
  timeout: number | null;
  verbose?: boolean;
}

export interface CommonAnalyzerRecvInternalOptions extends CommonAnalyzerOptions {
  opcodes: number[];
}

export function generateFlagsFromCommonOptions(
  commonOptions: CommonAnalyzerOptions,
): string[] {
  return [
    ...(commonOptions.timeout != null
      ? ["--timeout", commonOptions.timeout.toString()]
      : []),
    ...(commonOptions.verbose ? ["-v"] : []),
  ];
}

export function generateFlagsFromCommonRecvInternalOptions(
  commonOptions: CommonAnalyzerRecvInternalOptions,
): string[] {
  return [
    ...(commonOptions.timeout != null
      ? ["--timeout", commonOptions.timeout.toString()]
      : []),
    ...(commonOptions.verbose ? ["-v"] : []),
    ...commonOptions.opcodes.flatMap((opcode) => [
      "--opcode",
      opcode.toString(),
    ]),
  ];
}

export function generateOptionsForPropertyTree(
  commonOptions: CommonAnalyzerOptions,
): TreeProperty[] {
  return [
    {
      key: "Timeout",
      value:
        commonOptions.timeout !== null
          ? `${commonOptions.timeout} seconds`
          : "not set",
    },
  ];
}

export const commonAnalyzerOptions = {
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
} as const satisfies Record<string, Options>;

export const commonAnalyzerRecvInternalOptions = {
  ...commonAnalyzerOptions,
  "disable-opcode-extraction": {
    type: "boolean",
    description:
      "Disable opcode extraction. This affects path selection strategy and default timeout.",
  },
} as const satisfies Record<string, Options>;
