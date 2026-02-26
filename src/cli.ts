import yargs from "yargs";
import { Args, UIProvider } from "@ton/blueprint";
import { configureDrainCheckCommand } from "./commands/drain-check.js";
import { configureCleanCommand } from "./commands/clean.js";
import { configureOwnerHijackCommand } from "./commands/owner-hijack-check.js";
import { configureReproduceCommand } from "./commands/reproduce.js";
import { configureReplayAttackCheckCommand } from "./commands/replay-attack-check.js";
import { configureOpcodeInfoCommand } from "./commands/opcode-info.js";
import { configureAuditCommand } from "./commands/audit.js";
import { configureBounceCheckCommand } from "./commands/bounce-check.js";

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

  const drainCheckConfig = configureDrainCheckCommand(context);
  const replayAttackCheckConfig = configureReplayAttackCheckCommand(context);
  const cleanConfig = configureCleanCommand();
  const reproduceCommand = configureReproduceCommand(context);
  const ownerHijackConfig = configureOwnerHijackCommand(context);
  const opcodeInfoConfig = configureOpcodeInfoCommand(context);
  const auditConfig = configureAuditCommand(context);
  const bounceCheckConfig = configureBounceCheckCommand(context);

  return yargs(argv)
    .scriptName("tsa")
    .command(
      drainCheckConfig.command,
      drainCheckConfig.description,
      drainCheckConfig.builder,
      drainCheckConfig.handler,
    )
    .command(
      replayAttackCheckConfig.command,
      replayAttackCheckConfig.description,
      replayAttackCheckConfig.builder,
      replayAttackCheckConfig.handler,
    )
    .command(
      cleanConfig.command,
      cleanConfig.description,
      cleanConfig.builder,
      cleanConfig.handler,
    )
    .command(
      ownerHijackConfig.command,
      ownerHijackConfig.description,
      ownerHijackConfig.builder,
      ownerHijackConfig.handler,
    )
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
    .command(
      auditConfig.command,
      auditConfig.description,
      auditConfig.builder,
      auditConfig.handler,
    )
    .command(
      bounceCheckConfig.command,
      bounceCheckConfig.description,
      bounceCheckConfig.builder,
      bounceCheckConfig.handler,
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
      yargs.showHelp((s) => ui.write(s));
      process.exit(1);
    });
};
