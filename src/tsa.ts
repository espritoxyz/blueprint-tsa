import { Runner, Args, UIProvider } from "@ton/blueprint";
import { createCLI } from "./cli.js";
import { Sym } from "./common/constants.js";

export const tsa: Runner = async (args: Args, ui: UIProvider) => {
//   try {
    const cli = createCLI({ ui, args });
    await cli.parseAsync();
//   } catch (error) {
//     if (error instanceof Error) {
//       ui.clearActionPrompt();
//       ui.write(`${Sym.ERR} Error: ${error.message}`);
//       process.exit(1);
//     } else {
//       throw error;
//     }
//   }
};
