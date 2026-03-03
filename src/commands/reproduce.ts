import { readFileSync } from "fs";
import { Address, Cell } from "@ton/core";
import {
  createNetworkProvider,
  NetworkProvider,
  UIProvider,
} from "@ton/blueprint";
import {
  DeployConfig,
  deployViaChameleon,
  reproduce,
} from "../reproduce/network.js";
import {
  ConcreteAnalysisConfig,
  runConcreteAnalysis,
} from "../reproduce/concrete-analysis.js";
import {
  DEPLOY_AND_REPRODUCE_COMMAND,
  REPRODUCE_ID,
  Sym,
} from "../common/constants.js";
import { printCleanupInstructions } from "../reproduce/utils.js";
import { CommandContext } from "../cli.js";
import { CommandModule, InferredOptionTypes } from "yargs";
import { TsaVulnerabilityConfigSchema } from "../reproduce/reproduce-config.js";
import { nanotonToTon } from "../common/format-utils.js";

const reproduceCommandFlags = {
  config: {
    alias: "c",
    type: "string",
    describe: "Path to the reproduction config",
  },
} as const;

type ReproduceCommandSchema = InferredOptionTypes<typeof reproduceCommandFlags>;

export function createReproduceCommand(
  context: CommandContext,
): CommandModule<object, ReproduceCommandSchema> {
  return {
    command: REPRODUCE_ID,
    describe: "Reproduce found vulnerability",
    builder: reproduceCommandFlags,
    handler: async (argv: ReproduceCommandSchema) => {
      await executeReproduceCommand(context, argv);
    },
  };
}

async function checkAddressContainsExpectedData(
  network: NetworkProvider,
  queriedAddress: Address,
  config: DeployConfig,
  ui: UIProvider,
) {
  const contractState = await network.getContractState(queriedAddress);
  if (contractState.state.type !== "active") {
    throw new Error(`Contract at ${queriedAddress.toString()} is not active`);
  }
  let dataMatches = false;
  if (contractState.state.data) {
    const actualData = Cell.fromBoc(contractState.state.data)[0];
    dataMatches = actualData.equals(config.data);
  }
  if (dataMatches) {
    ui.write(
      `${Sym.OK} The data stored at contract matches the expected data.`,
    );
    ui.write(`${Sym.OK} Balance: ${nanotonToTon(contractState.balance)}.`);
  } else {
    ui.write(
      `${Sym.ERR} Contract data on the contract does not match data on the config`,
    );
    process.exit(1);
  }
  return contractState;
}

export const executeReproduceCommand = async (
  context: CommandContext,
  parsedArgs: ReproduceCommandSchema,
) => {
  const { ui } = context;
  const reproduceConfigPath = parsedArgs.config;
  if (!reproduceConfigPath) {
    throw new Error("Please specify the reproduction config file");
  }
  const configJsonResult = TsaVulnerabilityConfigSchema.safeParse(
    JSON.parse(readFileSync(reproduceConfigPath, "utf-8")),
  );
  if (!configJsonResult.success) {
    ui.write("Failed to parse reproduce config file");
    process.exit(1);
  }
  const configJson = configJsonResult.data;
  const network = await createNetworkProvider(ui, { _: [] });

  if (configJson.mode === DEPLOY_AND_REPRODUCE_COMMAND) {
    const codeHex = JSON.parse(readFileSync(configJson.codePath, "utf-8")).hex;
    const dataBinary = readFileSync(configJson.dataPath);
    const config: DeployConfig = {
      code: Cell.fromBoc(Buffer.from(codeHex, "hex"))[0],
      data: Cell.fromBoc(dataBinary)[0],
      suggestedBalance: BigInt(configJson.suggestedBalance),
      suggestedValue: BigInt(configJson.suggestedValue),
    };
    const useExistingContract = await ui.prompt(
      "Do you want to reuse an already deployed contract?",
    );

    const getUserInputAddress = async () => {
      return await ui.inputAddress("Input the address to deploy contract to");
    };
    const deployChameleon = async () => {
      const nonces = Array.from(Array(8), () =>
        BigInt(Math.floor(Math.random() * (1 << 29))),
      );
      const deployResult = await deployViaChameleon(network, config, nonces);
      return deployResult.address;
    };
    const address = useExistingContract
      ? await getUserInputAddress()
      : await deployChameleon();
    const contractState = await checkAddressContainsExpectedData(
      network,
      address,
      config,
      ui,
    );

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
      timeout: configJson.timeout,
      concreteCheckerOptions: configJson.concreteCheckerOptions,
    };

    const vulnerability = await runConcreteAnalysis(
      ui,
      configJson.command,
      concreteAnalysisConfig,
    );
    if (vulnerability == null) {
      return;
    }

    printCleanupInstructions(ui);

    await reproduce(network, vulnerability);
  }
};
