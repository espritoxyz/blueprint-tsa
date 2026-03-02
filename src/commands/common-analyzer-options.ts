export interface CommonAnalyzerOptions {
  timeout: number | null;
  opcodes: number[];
  verbose?: boolean;
}

export function generateFlagsFromCommonOptions(
  commonOptions: CommonAnalyzerOptions,
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
