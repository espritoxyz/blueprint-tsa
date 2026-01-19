import arg from 'arg';
import { readFileSync } from 'fs';
import { Cell, beginCell } from '@ton/core';
import { Runner, Args, UIProvider, createNetworkProvider } from "@ton/blueprint";
import { deployAndReproduce } from "./network.js";

const argSpec = {
    '--mainnet': Boolean,
    '--testnet': Boolean,

    '--tonscan': Boolean,
    '--tonviewer': Boolean,
    '--toncx': Boolean,
    '--dton': Boolean,
};

export const tsaReproduce: Runner = async (args: Args, ui: UIProvider) => {
  try {
    const reproduceConfigPath = args._[0];

    const codePath = args._[1];
    const codeJson = JSON.parse(readFileSync(codePath, "utf-8"));
    const codeCell = Cell.fromBoc(Buffer.from(codeJson.hex, "hex"))[0];

    const network = await createNetworkProvider(ui, arg(argSpec));

    await deployAndReproduce(network, ui, codeCell, Cell.fromBoc(Buffer.from("b5ee9c7201010101000a0000100000234c00000000", "hex"))[0]);

  } catch (error) {
    if (error instanceof Error) {
      ui.write(`Error: ${error.message}`);
    } else {
      throw error;
    }
  }
};
