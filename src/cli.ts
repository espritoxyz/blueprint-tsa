import yargs from "yargs";
import { Args, UIProvider } from "@ton/blueprint";
import { configureDrainCheckCommand } from "./commands/drain-check.js";

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
  const { args } = context;

  const argv = args._.slice(1);

  const drainCheckConfig = configureDrainCheckCommand(context);

  return yargs(argv)
    .scriptName("tsa")
    .command(
      drainCheckConfig.command,
      drainCheckConfig.description,
      drainCheckConfig.builder,
      drainCheckConfig.handler
    )
    .demandCommand(1, "Please specify a subcommand")
    .help()
    .alias("help", "h")
    .strict();
};
