import yargs from "yargs";
import { Args, UIProvider } from "@ton/blueprint";
import { configureDrainCheckCommand } from "./commands/drain-check.js";
import { configureCleanCommand } from "./commands/clean.js";

export interface CommandContext {
  ui: UIProvider;
  args: Args;
}

export interface CommandHandler {
  (context: CommandContext, parsedArgs: any): Promise<void>;
}

/**
 * Main CLI router - parses subcommands and delegates to handlers
 */
export const createCLI = (context: CommandContext) => {
  const { args, ui } = context;

  const argv = args._.slice(1);

  const drainCheckConfig = configureDrainCheckCommand(context);
  const cleanConfig = configureCleanCommand();

  return yargs(argv)
    .scriptName("tsa")
    .command(
      drainCheckConfig.command,
      drainCheckConfig.description,
      drainCheckConfig.builder,
      drainCheckConfig.handler
    )
    .command(
      cleanConfig.command,
      cleanConfig.description,
      cleanConfig.builder,
      cleanConfig.handler
    )
    .demandCommand(1, "Please specify a subcommand")
    .help()
    .alias("help", "h")
    .strict()
    .fail(async (msg, err, yargs) => {
      if (err) {
        throw err;
      }
      ui.write(`\nError: ${msg}`);
      ui.write("");
      yargs.showHelp(s => ui.write(s));
      process.exit(1);
    });
};
