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

export interface ReproduceConfig {
  code: Cell;
  data: Cell;
  msgBody: Cell;
  suggestedBalance: bigint;
  suggestedValue: bigint;
  deploymentMessage: Cell;
}

export const tsaReproduce: Runner = async (args: Args, ui: UIProvider) => {
  try {
    const reproduceConfigPath = args._[1];
    const configJson = JSON.parse(readFileSync(reproduceConfigPath, "utf-8"));

    const codeHex = JSON.parse(readFileSync(configJson.codePath, "utf-8")).hex
    const dataHex = readFileSync(configJson.dataPath, "utf-8")
    const msgBodyHex = readFileSync(configJson.msgBodyPath, "utf-8")
    const deploymentMessageHex = configJson.deploymentMessage ?? 'b5ee9c72010101010002000000'
    const config: ReproduceConfig = {
      code: Cell.fromBoc(Buffer.from(codeHex, "hex"))[0],
      data: Cell.fromBoc(Buffer.from(dataHex, "hex"))[0],
      msgBody: Cell.fromBoc(Buffer.from(msgBodyHex, "hex"))[0],
      suggestedBalance: BigInt(configJson.suggestedBalance),
      suggestedValue: BigInt(configJson.suggestedValue),
      deploymentMessage: Cell.fromBoc(Buffer.from(deploymentMessageHex, "hex"))[0],
    }

    const network = await createNetworkProvider(ui, arg(argSpec));

    const address = await deploy(network, ui, config);
    await reproduce(network, ui, address, config);

  } catch (error) {
    if (error instanceof Error) {
      ui.write(`Error: ${error.message}`);
    } else {
      throw error;
    }
  }
};
