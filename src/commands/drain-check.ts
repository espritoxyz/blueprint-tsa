import { Argv } from "yargs";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { beginCell, getMethodId } from "@ton/core";
import { generateTreeTable, TreeProperty } from "../common/draw.js";
import { Sym, DRAIN_CHECK_SYMBOLIC_FILENAME, DRAIN_CHECK_ID, DRAIN_CHECK_CONCRETE_FILENAME } from "../common/constants.js";
import { buildContracts, compileFuncFile } from "../common/build-utils.js";
import { findCompiledContract, getCheckerPath } from "../common/paths.js";
import { CommandHandler, CommandContext } from "../cli.js";
import { Analyzer } from "../common/analyzer.js";
import { ReproduceConfig } from "../reproduce/network.js";
import { ConcreteAnalysisConfig } from "../reproduce/concrete-analysis.js";

export const configureDrainCheckCommand = (context: CommandContext): any => {
  return {
    command: DRAIN_CHECK_ID,
    description: "Analyze contract for drain vulnerabilities",
    builder: (yargs: Argv) =>
      yargs
        .option("timeout", {
          alias: "t",
          type: "number",
          description: "Analysis timeout in milliseconds",
        })
        .option("nonce", {
          type: "string",
          description: "Name of get-method for extracting nonce in C4",
        })
        .option("contract", {
          alias: "c",
          type: "string",
          description: "Contract name or path",
          demandOption: true,
        }),
    handler: async (argv: any) => {
      await drainCheckCommand(context, argv);
    },
  };
};

const drainCheckCommand: CommandHandler = async (context: CommandContext, parsedArgs: any) => {
  const { ui } = context;

  await buildContracts(ui);

  if (!parsedArgs.contract) {
    throw new Error("Contract name or path is required");
  }
  const contract = parsedArgs.contract;
  const contractPath = findCompiledContract(contract);

  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${contract} not found`);
    process.exit(1);
  }

  const checkerPath = getCheckerPath(DRAIN_CHECK_SYMBOLIC_FILENAME);

  if (!existsSync(checkerPath)) {
    ui.write(`\n${Sym.ERR} Checker file not found at ${checkerPath}`);
    process.exit(1);
  }

  const timeout = parsedArgs.timeout ?? null;

  const properties: TreeProperty[] = [
    { key: "Contract", value: contract },
    { key: "TSA mode", value: "TON drain" },
    {
      key: "Options",
      separator: true,
      children: [
        { key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set" }
      ],
    },
  ];

  const output = generateTreeTable("Drain Check Analysis", properties);
  ui.write("");
  ui.write(output);
  ui.write("");
  ui.setActionPrompt(`${Sym.WAIT} Compiling checker...`);

  // Compile FunC to BoC
  let bocCode: string;
  try {
    bocCode = await compileFuncFile(checkerPath, DRAIN_CHECK_SYMBOLIC_FILENAME);
  } catch (error) {
    ui.clearActionPrompt();
    ui.write(`\n${Sym.ERR} Compilation failed: ${(error as Error).message}`);
    process.exit(1);
  }

  // Write BoC to temporary file
  const tempBocPath = path.join(tmpdir(), `drain-check-${Date.now()}.boc`);
  const bocBuffer = Buffer.from(bocCode, "base64");
  writeFileSync(tempBocPath, bocBuffer);

  let nonceMethodId = 0;
  if (parsedArgs.nonce) {
    nonceMethodId = getMethodId(parsedArgs.nonce);
  }

  const checkerCell = beginCell()
    .storeUint(nonceMethodId, 32)
    .storeUint(0, 64)
    .endCell();
  const checkerCellBoc = checkerCell.toBoc();
  const tempCheckerCellPath = path.join(tmpdir(), `c4-cell-${Date.now()}.boc`);
  writeFileSync(tempCheckerCellPath, checkerCellBoc);

  try {
    ui.clearActionPrompt();
    ui.setActionPrompt(`${Sym.WAIT} Running analysis...`);

    const analyzer = await Analyzer.create();
    await analyzer.run([
      "custom-checker-compiled",
      "--checker",
      tempBocPath,
      "--contract",
      contractPath,
      "--stop-when-exit-codes-found",
      "1000",
      "--checker-data",
      tempCheckerCellPath,
    ]);

    ui.clearActionPrompt();
    ui.write(`${Sym.OK} Analysis complete.`);
  } finally {
    // Clean up temporary BoC files
    if (existsSync(tempBocPath)) {
      unlinkSync(tempBocPath);
    }
    if (existsSync(tempCheckerCellPath)) {
      unlinkSync(tempCheckerCellPath);
    }
  }
};

export const drainCheckConcrete = async (config: ConcreteAnalysisConfig): Promise<ReproduceConfig> => {
  const { ui } = config;

  if (!existsSync(config.codePath)) {
    ui.write(`\n${Sym.ERR} Code at ${config.codePath} not found`);
    process.exit(1);
  }

  const checkerPath = getCheckerPath(DRAIN_CHECK_CONCRETE_FILENAME);

  if (!existsSync(checkerPath)) {
    ui.write(`\n${Sym.ERR} Checker file not found at ${checkerPath}`);
    process.exit(1);
  }

  const timeout = config.timeout;

  const properties: TreeProperty[] = [
    { key: "Contract", value: config.contractAddress.toRawString() },
    { key: "TSA mode", value: "TON drain reproduction" },
    {
      key: "Options",
      separator: true,
      children: [
        { key: "Timeout", value: timeout !== null ? `${timeout} seconds` : "not set" },
        { key: "Sender", value: config.senderAddress.toRawString() }
      ],
    },
  ];

  const output = generateTreeTable("Drain Check Analysis", properties);
  ui.write("");
  ui.write(output);
  ui.write("");
  ui.setActionPrompt(`${Sym.WAIT} Compiling checker...`);

  // Compile FunC to BoC
  let bocCode: string;
  try {
    bocCode = await compileFuncFile(checkerPath, DRAIN_CHECK_CONCRETE_FILENAME);
  } catch (error) {
    ui.clearActionPrompt();
    ui.write(`\n${Sym.ERR} Compilation failed: ${(error as Error).message}`);
    process.exit(1);
  }

  // Write BoC to temporary file
  const tempBocPath = path.join(tmpdir(), `drain-check-${Date.now()}.boc`);
  const bocBuffer = Buffer.from(bocCode, "base64");
  writeFileSync(tempBocPath, bocBuffer);

  const checkerCell = beginCell()
    .storeAddress(config.senderAddress)
    .endCell();
  const checkerCellBoc = checkerCell.toBoc();
  const tempCheckerCellPath = path.join(tmpdir(), `c4-cell-${Date.now()}.boc`);
  writeFileSync(tempCheckerCellPath, checkerCellBoc);

  try {
    ui.clearActionPrompt();
    ui.setActionPrompt(`${Sym.WAIT} Running analysis...`);

    const analyzer = await Analyzer.create();
    await analyzer.run([
      "custom-checker-compiled",
      "--checker",
      tempBocPath,
      "--contract",
      config.codePath,
      "--data",
      config.dataPath,
      "--stop-when-exit-codes-found",
      "1000",
      "--checker-data",
      tempCheckerCellPath,
    ]);

    ui.clearActionPrompt();
    ui.write(`${Sym.OK} Analysis complete.`);
  } finally {
    // Clean up temporary BoC files
    if (existsSync(tempBocPath)) {
      unlinkSync(tempBocPath);
    }
    if (existsSync(tempCheckerCellPath)) {
      unlinkSync(tempCheckerCellPath);
    }
  }

  return {
    address: config.contractAddress,
    msgBody: beginCell().endCell(),
    suggestedValue: 0n,
  };
};
