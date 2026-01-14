import { Argv } from "yargs";
import { existsSync } from "fs";
import { generateTreeTable, TreeProperty } from "../common/draw.js";
import { Sym } from "../common/constants.js";
import { buildContracts } from "../common/blueprint-utils.js";
import { findCompiledContract } from "../common/paths.js";
import { CommandHandler, CommandContext } from "../cli.js";
import { Analyzer } from "../common/analyzer.js";

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

  const timeout = parsedArgs.timeout ?? null;

  const properties: TreeProperty[] = [
    { key: "Contract", value: contract },
    { key: "Checker", value: "TON drain" },
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
  ui.setActionPrompt(`${Sym.WAIT} Running analysis...`);

  // Simulate analysis delay
  await new Promise(resolve => setTimeout(resolve, 2000));

//   const analyzer = await Analyzer.create();
//   await analyzer.run([]);

  ui.clearActionPrompt();
  ui.write(`${Sym.OK} Analysis complete.`);
};

export const configureDrainCheckCommand = (context: CommandContext): any => {
  return {
    command: "drain-check",
    description: "Analyze contract for drain vulnerabilities",
    builder: (yargs: Argv) =>
      yargs
        .option("timeout", {
          alias: "t",
          type: "number",
          description: "Analysis timeout in milliseconds",
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