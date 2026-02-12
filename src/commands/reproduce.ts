import {readFileSync} from "fs";
import {Address, Cell} from "@ton/core";
import {createNetworkProvider, NetworkProvider, UIProvider} from "@ton/blueprint";
import {DeployConfig, deployViaChameleon, reproduce} from "../reproduce/network.js";
import {ConcreteAnalysisConfig, runConcreteAnalysis} from "../reproduce/concrete-analysis.js";
import {DEPLOY_AND_REPRODUCE_COMMAND, REPRODUCE_ID, Sym} from "../common/constants.js";
import {printCleanupInstructions} from "../reproduce/utils.js";
import {CommandContext} from "../cli.js";
import {Argv} from "yargs";

export const configureReproduceCommand = (context: CommandContext): any => ({
  command: REPRODUCE_ID,
  description: "Reproduce found vulnerability",
  builder: (yargs: Argv) =>
    yargs
      .option("config", {
        alias: "c",
        type: "string",
        description: "Path to the reproduction config",
        demandOption: true,
      }),
  handler: async (argv: any) => await executeReproduceCommand(context, argv),
});

async function checkAddressContainsExpectedData(network: NetworkProvider, queriedAddress: Address, config: DeployConfig, ui: UIProvider) {
  const contractState = await network.getContractState(queriedAddress);
  if (contractState.state.type !== "active") {
    throw new Error(`Contract at ${queriedAddress.toString()} is not active`);
  }
  let dataMatches = false;
  if (contractState.state.data) {
    const actualData = Cell.fromBoc(contractState.state.data)[0];
    dataMatches = actualData.equals(config.data);
  }
  if (!dataMatches) {
    ui.write(`${Sym.ERR} Contract data on the contract does not match data on the config`);
    process.exit(1);
  }
  return contractState;
}

export const executeReproduceCommand = async (context: CommandContext, parsedArgs: any) => {
  const {ui} = context;
  const reproduceConfigPath = parsedArgs.config;
  if (!reproduceConfigPath) {
    throw new Error("Please specify the reproduction config file");
  }
  const configJson = JSON.parse(readFileSync(reproduceConfigPath, "utf-8")); // TODO handle the reading from JSON properly with avoiding crashes
  const network = await createNetworkProvider(ui, {_: []});

  if (configJson.mode === DEPLOY_AND_REPRODUCE_COMMAND) {
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
    const emptyAddress = Address.parseRaw("0:0000000000000000000000000000000000000000000000000000000000000000");
    const inputAddress = await ui.inputAddress("Input the address to deploy contract to (or press Enter to deploy new contract", emptyAddress);
    const deployChameleon = async () => {
      const nonces = Array.from(Array(8), () => BigInt(Math.floor(Math.random() * (1 << 29))));
      const deployResult = await deployViaChameleon(network, config, nonces);
      return deployResult.address;
    };
    const address = inputAddress !== emptyAddress
      ? inputAddress
      : await deployChameleon();
    const contractState = await checkAddressContainsExpectedData(network, address, config, ui);

    const senderAddress = network.sender().address;
    if (!senderAddress) {
      throw new Error("Sender address is not available");
    }


    const concreteAnalysisConfig: ConcreteAnalysisConfig = {
      codePath: configJson.codePath,
      dataPath: configJson.dataPath,
      balance: contractState.balance,
      contractAddress: address,
      senderAddress,
      ui,
      timeout: configJson.timeout ?? null,
    };

    const vulnerability = await runConcreteAnalysis(configJson.command, concreteAnalysisConfig);
    if (vulnerability == null) {
      return;
    }

    printCleanupInstructions(ui);

    await reproduce(network, vulnerability);
  }
};
