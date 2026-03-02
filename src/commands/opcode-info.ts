import { Argv } from "yargs";
import yargs from "yargs";
import path from "path";
import { CommandContext, CommandHandler } from "../cli.js";
import {
  OPCODE_INFO,
  Sym,
  ERROR_EXIT_CODE,
  OPCODE_AUTHORIZATION_CHECK_FILENAME,
  OPCODE_INFO_DESCRIPTION_URL,
} from "../common/constants.js";
import { UIProvider } from "@ton/blueprint";
import { extractOpcodes } from "../common/opcode-extractor.js";
import { buildAllContracts } from "../common/build-utils.js";
import {
  findCompiledContract,
  getSarifReportPath,
  getCheckerPath,
  getReportDirectory,
  getInputsPath,
} from "../common/paths.js";
import { existsSync } from "fs";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import { beginCell } from "@ton/core";
import { TreeProperty } from "../common/draw.js";
import { formatOpcodeHex } from "../common/format-utils.js";
import { findNonFailingExecution } from "../common/result-parsing.js";

export interface OpcodeInfo {
  opcode: number;
  withAuthorization: boolean;
  vulnerabilityPath?: string;
}

export async function runOpcodeAuthorizationCheckAnalysis(
  opcode: number,
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  completionMessage: string = "Analysis complete.",
  verbose: boolean = false,
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

  await analyzer.run(
    OPCODE_AUTHORIZATION_CHECK_FILENAME,
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
      ...(timeout != null ? ["--timeout", timeout.toString()] : []),
      "--disable-out-message-analysis",
      "--exported-inputs",
      getReportDirectory(wrapper.id),
      ...(verbose ? ["-v"] : []),
    ],
    completionMessage,
  );

  const vulnerability = analyzer.vulnerabilityIsPresent();
  const nonFailingExecutionIndex = findNonFailingExecution(sarifPath);

  if (nonFailingExecutionIndex === undefined && !vulnerability) {
    return null;
  }

  const withAuthorization = !vulnerability;
  let vulnerabilityPath: string | undefined;
  if (vulnerability) {
    const vulnDesc = analyzer.getVulnerabilityFromReport();
    if (vulnDesc) {
      vulnerabilityPath = getInputsPath(analyzer.id, vulnDesc.executionIndex);
    }
  }

  return {
    opcode,
    withAuthorization,
    vulnerabilityPath,
  };
}

async function extractOpcodeInfo(
  opcode: number,
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  verbose: boolean,
): Promise<OpcodeInfo | null> {
  return runOpcodeAuthorizationCheckAnalysis(
    opcode,
    contractName,
    contractPath,
    ui,
    timeout,
    "Analysis complete.",
    verbose,
  );
}

async function getAllOpcodeInfo(
  opcodes: number[],
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  verbose: boolean,
): Promise<OpcodeInfo[]> {
  const results: OpcodeInfo[] = [];
  for (const opcode of opcodes) {
    const info = await extractOpcodeInfo(
      opcode,
      contractName,
      contractPath,
      ui,
      timeout,
      verbose,
    );
    if (info !== null) {
      results.push(info);
    }
  }
  return results;
}

export function formatOpcodeInfo(infos: OpcodeInfo[]): string {
  if (infos.length === 0) {
    return "No opcodes to analyze.";
  }

  const lines: string[] = ["Opcode Authorization Analysis:", ""];

  let hasUnauthorizedOpcodes = false;
  for (const info of infos) {
    const opcodeHex = formatOpcodeHex(info.opcode);
    const authStatus = info.withAuthorization
      ? `${Sym.OK} Has authorization checks`
      : `${Sym.WARN} No authorization checks`;
    lines.push(`${opcodeHex}: ${authStatus}`);

    // If authorization is missing and vulnerability path is available, show it
    if (!info.withAuthorization && info.vulnerabilityPath) {
      const relativePath = path.relative(process.cwd(), info.vulnerabilityPath);
      lines.push(`  Path to reproducing input: ${relativePath}`);
      hasUnauthorizedOpcodes = true;
    }

    lines.push("");
  }

  // Add description URL if any opcodes lack authorization
  if (hasUnauthorizedOpcodes) {
    lines.push(`Description: ${OPCODE_INFO_DESCRIPTION_URL}`);
  }

  lines.push("");
  return lines.join("\n");
}

const opcodeInfoHandler: CommandHandler = async (
  context: CommandContext,
  args: yargs.ArgumentsCamelCase,
) => {
  const { ui } = context;
  const { timeout, contract, verbose } = args;

  await buildAllContracts(ui);
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

  if (opcodes.length === 0) {
    ui.write("");
    ui.write(`${Sym.WARN} No opcodes found in contract`);
    return;
  }

  const infos = await getAllOpcodeInfo(
    opcodes,
    contract as string,
    codePath,
    ui,
    (timeout as number) ?? null,
    verbose as boolean,
  );

  ui.write("");
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
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          description: "Use debug output in TSA log",
        }),
    handler: async (argv: yargs.ArgumentsCamelCase) => {
      await opcodeInfoHandler(context, argv);
    },
  };
};
