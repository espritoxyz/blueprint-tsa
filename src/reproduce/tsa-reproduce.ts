import arg from "arg";
import { readFileSync } from "fs";
import { Cell } from "@ton/core";
import { Runner, Args, UIProvider, createNetworkProvider } from "@ton/blueprint";
import { deploy, DeployConfig, reproduce } from "./network.js";
import { ConcreteAnalysisConfig, runConcreteAnalysis } from "./concrete-analysis.js";

const argSpec = {
  "--mainnet": Boolean,
  "--testnet": Boolean,

  "--tonscan": Boolean,
  "--tonviewer": Boolean,
  "--toncx": Boolean,
  "--dton": Boolean,
};

export const tsaReproduce: Runner = async (args: Args, ui: UIProvider) => {
  try {
    const reproduceConfigPath = args._[1];
    const configJson = JSON.parse(readFileSync(reproduceConfigPath, "utf-8"));

    const network = await createNetworkProvider(ui, arg(argSpec));

    if (configJson.mode == "deploy-and-reproduce") {
      const codeHex = JSON.parse(readFileSync(configJson.codePath, "utf-8")).hex;
      const dataBinary = readFileSync(configJson.dataPath);
      const deploymentMessageHex = configJson.deploymentMessage ?? "b5ee9c72010101010002000000";
      const config: DeployConfig = {
        code: Cell.fromBoc(Buffer.from(codeHex, "hex"))[0],
        data: Cell.fromBoc(dataBinary)[0],
        suggestedBalance: BigInt(configJson.suggestedBalance),
        suggestedValue: BigInt(configJson.suggestedValue),
        deploymentMessage: Cell.fromBoc(Buffer.from(deploymentMessageHex, "hex"))[0],
      };

      const deployResult = await deploy(network, config);
      const senderAddress = network.sender().address;
      if (!senderAddress) {
        throw new Error("Sender address is not available");
      }

      const concreteAnalysisConfig: ConcreteAnalysisConfig = {
        codePath: configJson.codePath,
        dataPath: configJson.dataPath,
        balance: deployResult.balance,
        contractAddress: deployResult.address,
        senderAddress: senderAddress,
        ui: ui,
        timeout: configJson.timeout,
      };

      await runConcreteAnalysis(configJson.command, concreteAnalysisConfig);
    }

  } catch (error) {
    if (error instanceof Error) {
      ui.write(`Error: ${error.message}`);
    } else {
      throw error;
    }
  }
};
