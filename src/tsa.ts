import { Runner, Args, UIProvider } from "@ton/blueprint";
import { createCLI } from "./cli.js";

export const tsa: Runner = async (args: Args, ui: UIProvider) => {
  try {
    const cli = createCLI({ ui, args });
    await cli.parseAsync();
  } catch (error) {
    if (error instanceof Error) {
      ui.write(`Error: ${error.message}`);
    }
  }
};
