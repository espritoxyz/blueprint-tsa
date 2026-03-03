import { CommandModule, InferredOptionTypes, Options } from "yargs";
import { writeFileSync } from "fs";
import { beginCell } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { TreeProperty } from "../common/draw.js";
import { CommandContext } from "../cli.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import {
  BOUNCE_CHECK_FILENAME,
  BOUNCE_CHECK_ID,
  BOUNCE_CHECK_SCHEME_FILENAME,
  ERROR_EXIT_CODE,
  BOUNCE_CHECK_NAME,
  THROWER_FILENAME,
  BOUNCE_DESCRIPTION_URL,
} from "../common/constants.js";
import {
  buildAllContracts,
  compileFuncFileToBase64Boc,
} from "../common/build-utils.js";
import { doWithTemporaryFile } from "../common/file-utils.js";
import {
  getCheckerPath,
  getSarifReportPath,
  getReportDirectory,
  getThrowerPath,
} from "../common/paths.js";
import {
  CommonAnalyzerRecvInternalOptions,
  commonAnalyzerRecvInternalOptions,
  generateFlagsFromCommonOptions,
  generateOptionsForPropertyTree,
} from "./common-analyzer-options.js";
import {
  resolveBuiltContract,
  resolveOpcodesAndTimeout,
  reportAndExit,
} from "./command-utils.js";
import { tmpdir } from "os";
import path from "path";

const bounceCheckOptions = {
  contract: {
    alias: "c",
    type: "string",
    description: "Contract name",
    demandOption: true,
  },
  ...commonAnalyzerRecvInternalOptions,
} as const satisfies Record<string, Options>;

type BounceCheckSchema = InferredOptionTypes<typeof bounceCheckOptions>;

export const createBounceCheckCommand = (
  context: CommandContext,
): CommandModule<object, BounceCheckSchema> => {
  return {
    command: BOUNCE_CHECK_ID,
    describe: "Check if contract processes bounced messages correctly",
    builder: bounceCheckOptions,
    handler: async (argv: BounceCheckSchema) => {
      await bounceCheckCommand(context.ui, argv);
    },
  };
};

/**
 * Runs bounce check analysis and returns the analyzer wrapper
 * @param ui - UI provider
 * @param contractName - Name of the contract
 * @param contractPath - Path to the compiled contract
 * @param commonOptions
 * @param completionMessage
 * @returns AnalyzerWrapper instance
 */
export const runBounceCheckAnalysis = async (
  ui: UIProvider,
  contractName: string,
  contractPath: string,
  commonOptions: CommonAnalyzerRecvInternalOptions,
  completionMessage: string = "Analysis complete.",
): Promise<AnalyzerWrapper> => {
  const checkerPath = getCheckerPath(BOUNCE_CHECK_FILENAME);
  const schemePath = getCheckerPath(BOUNCE_CHECK_SCHEME_FILENAME);
  const throwerFuncPath = getThrowerPath();

  // Compile thrower FunC to BoC
  const throwerBocBase64 = await compileFuncFileToBase64Boc(
    throwerFuncPath,
    THROWER_FILENAME,
  );

  const tempThrowerBocPath = path.join(tmpdir(), `thrower-${Date.now()}.boc`);

  return doWithTemporaryFile(async (tempPath) => {
    writeFileSync(tempPath, Buffer.from(throwerBocBase64, "base64"));

    const properties: TreeProperty[] = [
      { key: "Contract", value: contractName },
      { key: "Mode", value: BOUNCE_CHECK_NAME },
      {
        key: "Options",
        separator: true,
        children: [...generateOptionsForPropertyTree(commonOptions)],
      },
    ];

    const checkerCell = beginCell().endCell();

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
      BOUNCE_CHECK_FILENAME,
      (wrapper) => [
        "custom-checker-compiled",
        "--checker",
        wrapper.getTempBocPath(),
        "--contract",
        contractPath,
        "--contract",
        tempPath,
        "--stop-when-exit-codes-found",
        ERROR_EXIT_CODE.toString(),
        "--checker-data",
        wrapper.getTempCheckerCellPath(),
        "--output",
        sarifPath,
        "--exported-inputs",
        reportDir,
        ...generateFlagsFromCommonOptions(commonOptions),
        "--scheme",
        schemePath,
        "--continue-on-contract-exception",
      ],
      completionMessage,
    );

    return analyzer;
  }, tempThrowerBocPath);
};

const bounceCheckCommand = async (
  ui: UIProvider,
  parsedArgs: BounceCheckSchema,
) => {
  const contractName = parsedArgs.contract;

  await buildAllContracts(ui);
  const contractPath = resolveBuiltContract(ui, contractName);

  const { opcodes, timeout } = await resolveOpcodesAndTimeout(
    ui,
    contractName,
    contractPath,
    {
      disableOpcodeExtraction: parsedArgs["disable-opcode-extraction"],
      explicitTimeout: parsedArgs.timeout,
    },
  );

  const analyzer = await runBounceCheckAnalysis(
    ui,
    contractName,
    contractPath,
    {
      timeout,
      opcodes,
      verbose: parsedArgs.verbose,
    },
  );
  reportAndExit(ui, analyzer, BOUNCE_DESCRIPTION_URL);
};
