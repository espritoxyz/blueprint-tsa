import arg from 'arg';
import { readFileSync } from 'fs';
import { Cell, beginCell } from '@ton/core';
import { Runner, Args, UIProvider, createNetworkProvider } from "@ton/blueprint";
import { deploy, reproduce } from "./network.js";

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

    const address = await deploy(network, ui, codeCell, beginCell().endCell(), 100000n);
    await reproduce(network, ui, address, beginCell().endCell(), 100000n);

  } catch (error) {
    if (error instanceof Error) {
      ui.write(`Error: ${error.message}`);
    } else {
      throw error;
    }
  }
};
