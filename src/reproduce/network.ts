import {Address, beginCell, Cell, contractAddress, StateInit, toNano} from "@ton/core";
import {NetworkProvider, UIProvider} from "@ton/blueprint";
import {DEPLOY_WAIT_ATTEMPTS, Sym} from "../common/constants.js";
import {compileFuncFileToBase64Boc} from "../common/build-utils.js";
import {getCheckerPath} from "../common/paths.js";

export interface DeployConfig {
  code: Cell;
  data: Cell;
  suggestedBalance: bigint;
  suggestedValue: bigint;
  deploymentMessage: Cell;
}

export interface DeployResult {
  address: Address;
  balance: bigint;
}


async function ensureDeployed(network: NetworkProvider, chameleonAddress: Address, config: DeployConfig, ui: UIProvider, chameleonStatInit: StateInit) {
  const isDeployed = await network.isContractDeployed(chameleonAddress);

  // ensure chameleon deployed
  if (!isDeployed) {
    let suggestedValue = config.suggestedBalance;
    if (suggestedValue < 0n) {
      suggestedValue = 0n;
    }
    const suggestedValueInTons = Number(suggestedValue) / 1e9;

    const tonsForDeployInput =
      await ui.input(`Enter amount of TONs for deployment message (suggested: ${suggestedValueInTons} + fees):`);

    const tonsForDeploy = toNano(tonsForDeployInput);
    await network.sender().send({
      to: chameleonAddress,
      value: tonsForDeploy,
      init: chameleonStatInit,
    });
    await network.waitForDeploy(chameleonAddress, DEPLOY_WAIT_ATTEMPTS);
    const chameleonState = await network.getContractState(chameleonAddress);
    if (chameleonState.state.type !== "active") {
      throw new Error(`Failed to deploy ${chameleonAddress}`);
    }
  }
}

export const deployViaChameleon = async (network: NetworkProvider, config: DeployConfig): Promise<DeployResult> => {
  const ui = network.ui();
  ui.write("deploying via chameleon V3");
  const chameleonContractFilename = "chameleon-contract.fc";
  const path = getCheckerPath(chameleonContractFilename);
  const chameleonContract = Cell.fromBase64(await compileFuncFileToBase64Boc(path, chameleonContractFilename));
  const nonce = Math.floor(Math.random() * (1 << 31));
  console.log("Nonce = ", nonce);
  const chameleonStateInit: StateInit = {
    code: chameleonContract,
    data: beginCell().storeInt(nonce, 32).endCell(),
  };
  const chameleonAddress = contractAddress(0, chameleonStateInit);
  await ensureDeployed(network, chameleonAddress, config, ui, chameleonStateInit);
  const tonsForSendingMessageInput =
    await ui.input(`Enter amount of TONs for deployment message (suggested: ${config.suggestedValue} + fees):`);
  const tonsForSendingMessage = toNano(tonsForSendingMessageInput);
  // filling the insides of the chameleon
  const messageToChameleon = beginCell().storeRef(config.data).storeRef(config.code).endCell();
  await network.sender().send({
    to: chameleonAddress,
    value: tonsForSendingMessage,
    body: messageToChameleon,
  });

  const chameleonState = await network.getContractState(chameleonAddress);
  if (chameleonState.state.type !== "active") {
    throw new Error(`Failed to deploy ${chameleonAddress}`);
  }
  return {
    address: chameleonAddress,
    balance: chameleonState.balance,
  };
};


export interface ReproduceConfig {
  address: Address;
  msgBody: Cell;
  suggestedValue: bigint;
}

export const reproduce = async (network: NetworkProvider, config: ReproduceConfig) => {
  const ui = network.ui();
  ui.write(`Number of TONs for reproduction message: ${Number(config.suggestedValue) / 1e9}`);
  await network.sender().send({
    to: config.address,
    value: config.suggestedValue,
    body: config.msgBody,
  });

  await network.waitForLastTransaction(DEPLOY_WAIT_ATTEMPTS);

  ui.write(`${Sym.OK} Reproduction message sent!`);
};