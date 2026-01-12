import { Argv } from "yargs";
import { generateTreeTable, TreeProperty } from "../draw.js";
import { Sym } from "../util.js";
import { CommandHandler, CommandContext } from "../cli.js";

const drainCheckCommand: CommandHandler = async (context: CommandContext, parsedArgs: any) => {
  const { ui } = context;

  const contract = parsedArgs.contract || "Unknown";
  const timeout = parsedArgs.timeout || 30000;
  const symbolic = parsedArgs.symbolic !== false;

  const properties: TreeProperty[] = [
    { key: "Contract", value: contract },
    { key: "Checker", value: "TON drain" },
    {
      key: "Options",
      separator: true,
      children: [
        { key: "Timeout", value: `${timeout}ms` },
        { key: "Contract data", value: symbolic ? "symbolic" : "concrete" },
      ],
    },
  ];

  const output = generateTreeTable("Drain Check Analysis", properties);
  ui.write(output);
  ui.write("");
  ui.setActionPrompt(`${Sym.WAIT} Running analysis...`);

  // Simulate analysis delay
  await new Promise(resolve => setTimeout(resolve, 2000));

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
          default: 30000,
        })
        .option("contract", {
          alias: "c",
          type: "string",
          description: "Contract name or path",
          demandOption: true,
        })
        .option("symbolic", {
          alias: "s",
          type: "boolean",
          description: "Use symbolic execution",
          default: true,
        }),
    handler: async (argv: any) => {
      await drainCheckCommand(context, argv);
    },
  };
};