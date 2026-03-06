import { CommandModule, InferredOptionTypes, Options } from "yargs";
import { beginCell, getMethodId } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { TreeProperty } from "../common/draw.js";
import { CommandContext } from "../cli.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import {
  REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME,
  REPLAY_ATTACK_CHECK_ID,
  ERROR_EXIT_CODE,
  REPLAY_DESCRIPTION_URL,
  Sym,
} from "../common/constants.js";
import { buildAllContracts } from "../common/build-utils.js";
import {
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
} from "../common/paths.js";
import {
  commonAnalyzerCliOptions,
  CommonAnalyzerArgs,
  generateFlagsFromCommonArgs,
  generateOptionsForPropertyTree,
} from "./common-analyzer-args.js";
import {
  resolveBuiltContract,
  reportAndExit,
  confirmLongRunningAnalysis,
} from "./command-utils.js";

const replayAttackCheckCliOptions = {
  "seqno-method-name": {
    alias: "s",
    type: "string",
    description: "Method name of a seqno getter method",
    demandOption: false,
  },
  "seqno-restriction": {
    alias: "r",
    type: "number",
    description:
      "The upper bound of a seqno. Only the seq numbers that satisfy the restrictions are considered in executions",
    demandOption: false,
  },
  ...commonAnalyzerCliOptions,
} as const satisfies Record<string, Options>;

type ReplayAttackCheckSchema = InferredOptionTypes<
  typeof replayAttackCheckCliOptions
>;

export const createReplayAttackCheckCommand = (
  context: CommandContext,
): CommandModule<object, ReplayAttackCheckSchema> => {
  return {
    command: REPLAY_ATTACK_CHECK_ID,
    describe: "Analyze contract for replay attack vulnerabilities",
    builder: replayAttackCheckCliOptions,
    handler: async (argv: ReplayAttackCheckSchema) => {
      await replayAttackCheckCommand(context.ui, argv);
    },
  };
};

interface SeqnoData {
  getterName: string;
  upperBound: number;
}

/**
 * Runs replay attack check analysis and returns the analyzer wrapper
 * @param ui - UI provider
 * @param contractPath - Path to the compiled contract
 * @param commonArgs - Common analyzer options (timeout, opcodes, verbose)
 * @param seqnoData - Add the seqno constraints on the checker
 * @param completionMessage
 * @returns AnalyzerWrapper instance
 */
export const runReplayAttackCheckAnalysis = async (
  ui: UIProvider,
  contractPath: string,
  commonArgs: CommonAnalyzerArgs,
  seqnoData: SeqnoData | null = null,
  completionMessage: string = "Analysis complete.",
): Promise<AnalyzerWrapper> => {
  const contractName = commonArgs.contract;
  const checkerPath = getCheckerPath(REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME);

  const properties: TreeProperty[] = [
    { key: "Contract", value: contractName },
    { key: "Mode", value: "Replay attack check" },
    {
      key: "Options",
      separator: true,
      children: [
        ...generateOptionsForPropertyTree(commonArgs),
        {
          key: "SeqnoData",
          value: seqnoData !== null ? JSON.stringify(seqnoData) : "not set",
        },
      ],
    },
  ];

  const checkerCell =
    seqnoData !== null
      ? beginCell()
          .storeUint(1, 1)
          .storeUint(getMethodId(seqnoData.getterName), 32)
          .storeUint(seqnoData.upperBound, 256)
          .endCell()
      : beginCell().storeUint(0, 1).endCell();

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
    REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME,
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
      ...generateFlagsFromCommonArgs(commonArgs),
      "--continue-on-contract-exception",
      "--disable-out-message-analysis",
    ],
    completionMessage,
  );

  return analyzer;
};

const resolveSeqnoData = (
  ui: UIProvider,
  seqnoMethodName: string | undefined,
  seqnoRestriction: number | undefined,
): SeqnoData | null => {
  if (seqnoMethodName !== undefined && seqnoRestriction !== undefined) {
    return { getterName: seqnoMethodName, upperBound: seqnoRestriction };
  }
  if (seqnoMethodName !== undefined || seqnoRestriction !== undefined) {
    ui.write(
      `\n${Sym.ERR} you should specify either both the seqno getter method and seqno restriction or neither`,
    );
    process.exit(1);
  }
  return null;
};

const replayAttackCheckCommand = async (
  ui: UIProvider,
  parsedArgs: ReplayAttackCheckSchema,
) => {
  const contractName = parsedArgs.contract;

  await buildAllContracts(ui);
  const contractPath = resolveBuiltContract(ui, contractName);

  const timeout = parsedArgs.timeout ?? null;

  const seqnoData = resolveSeqnoData(
    ui,
    parsedArgs["seqno-method-name"],
    parsedArgs["seqno-restriction"],
  );

  await confirmLongRunningAnalysis(ui, {
    commandLabel: REPLAY_ATTACK_CHECK_ID,
    contractName,
    timeoutSeconds: timeout,
    checkCount: 1,
    interactive: parsedArgs.interactive,
  });

  const analyzer = await runReplayAttackCheckAnalysis(
    ui,
    contractPath,
    {
      timeout,
      verbose: parsedArgs.verbose,
      contract: contractName,
      iterationLimit: parsedArgs["iteration-limit"],
      recursionLimit: parsedArgs["recursion-limit"],
      interactive: parsedArgs.interactive,
    },
    seqnoData,
  );

  reportAndExit(ui, analyzer, REPLAY_DESCRIPTION_URL);
};
