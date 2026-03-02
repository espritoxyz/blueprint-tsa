import yargs from "yargs";
import { Args, UIProvider } from "@ton/blueprint";
import { createDrainCheckCommand } from "./commands/drain-check.js";
import { createCleanCommand } from "./commands/clean.js";
import { createOwnerHijackCheckCommand } from "./commands/owner-hijack-check.js";
import { configureReproduceCommand } from "./commands/reproduce.js";
import { createReplayAttackCheckCommand } from "./commands/replay-attack-check.js";
import { configureOpcodeInfoCommand } from "./commands/opcode-info.js";
import { createAuditCommand } from "./commands/audit.js";
import { createBounceCheckCommand } from "./commands/bounce-check.js";

export interface CommandContext {
  ui: UIProvider;
  args: Args;
}

export interface CommandHandler {
  (
    context: CommandContext,
    parsedArgs: yargs.ArgumentsCamelCase,
  ): Promise<void>;
}

/**
 * Main CLI router - parses subcommands and delegates to handlers
 */
export const createCLI = (context: CommandContext) => {
  const { args, ui } = context;

  const argv = args._.slice(1);

  const reproduceCommand = configureReproduceCommand(context);
  const opcodeInfoConfig = configureOpcodeInfoCommand(context);
  return yargs(argv)
    .scriptName("tsa")
    .command(createDrainCheckCommand(context))
    .command(createOwnerHijackCheckCommand(context))
    .command(createReplayAttackCheckCommand(context))
    .command(createBounceCheckCommand(context))
    .command(createCleanCommand())
    .command(
      reproduceCommand.command,
      reproduceCommand.description,
      reproduceCommand.builder,
      reproduceCommand.handler,
    )
    .command(
      opcodeInfoConfig.command,
      opcodeInfoConfig.description,
      opcodeInfoConfig.builder,
      opcodeInfoConfig.handler,
    )
    .command(createAuditCommand(context))
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
      yargs.showHelp((s) => ui.write(s));
      process.exit(1);
    });
};
