import { Argv } from "yargs";
import yargs from "yargs";
import { CommandContext, CommandHandler } from "../cli.js";
import {
  OPCODE_INFO,
  Sym,
  ERROR_EXIT_CODE,
  OPCODE_AUTHORIZATION_CHECK_FILENAME,
} from "../common/constants.js";
import { UIProvider } from "@ton/blueprint";
import { extractOpcodes } from "../common/opcode-extractor.js";
import { buildContracts } from "../common/build-utils.js";
import {
  findCompiledContract,
  getSarifReportPath,
  getCheckerPath,
} from "../common/paths.js";
import { existsSync } from "fs";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import { beginCell } from "@ton/core";
import { TreeProperty } from "../common/draw.js";
import { formatOpcodeHex } from "../common/format-utils.js";
import { findNonFailingExecution } from "../common/result-parsing.js";

interface OpcodeInfo {
  opcode: number;
  withAuthorization: boolean;
}

async function extractOpcodeInfo(
  opcode: number,
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
): Promise<OpcodeInfo | null> {
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
        {
          key: "Timeout",
          value: timeout !== null ? `${timeout} seconds` : "not set",
        },
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
  });

  const sarifPath = getSarifReportPath(analyzer.id);

  await analyzer.run(OPCODE_AUTHORIZATION_CHECK_FILENAME, (wrapper) => [
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
    ...(timeout != null ? ["--timeout", timeout.toString()] : []),
    "--disable-out-message-analysis",
  ]);

  const vulnerability = analyzer.vulnerabilityIsPresent();

  const nonFailingExecutionIndex = findNonFailingExecution(sarifPath);

  if (nonFailingExecutionIndex === undefined && !vulnerability) {
    return null;
  }

  const withAuthorization = !vulnerability;

  return {
    opcode,
    withAuthorization,
  };
}

async function getAllOpcodeInfo(
  opcodes: number[],
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
): Promise<OpcodeInfo[]> {
  const results: OpcodeInfo[] = [];
  for (const opcode of opcodes) {
    const info = await extractOpcodeInfo(
      opcode,
      contractName,
      contractPath,
      ui,
      timeout,
    );
    if (info !== null) {
      results.push(info);
    }
  }
  return results;
}

function formatOpcodeInfo(infos: OpcodeInfo[]): string {
  if (infos.length === 0) {
    return "No opcodes to analyze.";
  }

  const lines: string[] = ["\nOpcode Authorization Analysis:", ""];

  for (const info of infos) {
    const opcodeHex = formatOpcodeHex(info.opcode);
    const authStatus = info.withAuthorization
      ? `${Sym.OK} Has authorization checks`
      : `${Sym.WARN} No authorization checks`;
    lines.push(`${opcodeHex}: ${authStatus}`);
  }

  lines.push("");
  return lines.join("\n");
}

const opcodeInfoHandler: CommandHandler = async (
  context: CommandContext,
  args: yargs.ArgumentsCamelCase,
) => {
  const { ui } = context;
  const { timeout, contract } = args;

  await buildContracts(ui);
  const codePath = findCompiledContract(contract as string);

  if (!existsSync(codePath)) {
    ui.write(`\n${Sym.ERR} Contract ${contract} not found`);
    process.exit(1);
  }

  const opcodes = await extractOpcodes({
    ui,
    codePath,
    contractName: contract as string,
  });
  const infos = await getAllOpcodeInfo(
    opcodes,
    contract as string,
    codePath,
    ui,
    (timeout as number) ?? null,
  );
  const output = formatOpcodeInfo(infos);
  ui.write(output);
};

export const configureOpcodeInfoCommand = (context: CommandContext) => {
  return {
    command: OPCODE_INFO,
    description: "Display information about contract opcodes",
    builder: (yargs: Argv) =>
      yargs
        .option("contract", {
          alias: "c",
          type: "string",
          description: "Contract name",
          demandOption: true,
        })
        .option("timeout", {
          alias: "t",
          type: "number",
          description: "Timeout in seconds for analyzing one opcode",
          default: 60,
        }),
    handler: async (argv: yargs.ArgumentsCamelCase) => {
      await opcodeInfoHandler(context, argv);
    },
  };
};
