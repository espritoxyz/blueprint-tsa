import { TreeProperty } from "../common/draw.js";
import { Options } from "yargs";

export interface CommonAnalyzerArgs {
  timeout: number | null;
  verbose?: boolean;
  contract: string;
}

export interface CommonAnalyzerRecvInternalOptions extends CommonAnalyzerArgs {
  opcodes: number[];
}

export function generateFlagsFromCommonOptions(
  commonOptions: CommonAnalyzerArgs,
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
  commonOptions: CommonAnalyzerArgs,
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

export const commonAnalyzerFlags = {
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

export const commonAnalyzerRecvInternalFlags = {
  ...commonAnalyzerFlags,
  "disable-opcode-extraction": {
    type: "boolean",
    description:
      "Disable opcode extraction. This affects path selection strategy and default timeout.",
  },
} as const satisfies Record<string, Options>;
