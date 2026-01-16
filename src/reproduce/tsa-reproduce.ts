import { Runner, Args, UIProvider, createNetworkProvider } from "@ton/blueprint";

export const tsaReproduce: Runner = async (args: Args, ui: UIProvider) => {
  try {
    const network = await createNetworkProvider(ui, { ...args, _: args._.slice(1) });
    // TODO
  } catch (error) {
    if (error instanceof Error) {
      ui.write(`Error: ${error.message}`);
    } else {
      throw error;
    }
  }
};
