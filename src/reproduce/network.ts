import {Address, beginCell, Builder, Cell, contractAddress, StateInit, toNano} from "@ton/core";
import {NetworkProvider} from "@ton/blueprint";
import {DEPLOY_WAIT_ATTEMPTS, Sym} from "../common/constants.js";
import {compileFuncFileToBase64Boc} from "../common/build-utils.js";
import {getCheckerPath} from "../common/paths.js";

export interface DeployConfig {
  code: Cell;
  data: Cell;
  suggestedBalance: bigint;
  suggestedValue: bigint;
}

export interface DeployResult {
  address: Address;
  balance: bigint;
}


async function ensureDeployed(
  network: NetworkProvider,
  chameleonAddress: Address,
  chameleonStateInit: StateInit,
  tonsForSendingMessage: bigint,
  messageToChameleon: Cell,
) {
  const ui = network.ui();
  const isDeployed = await network.isContractDeployed(chameleonAddress);

  // ensure chameleon deployed
  if (!isDeployed) {
    ui.write(`${Sym.WAIT} Sending a message to deploy the contract under test`);
    await network.sender().send({
      to: chameleonAddress,
      value: tonsForSendingMessage,
      init: chameleonStateInit,
      body: messageToChameleon,
    });
    await network.waitForDeploy(chameleonAddress, DEPLOY_WAIT_ATTEMPTS);
    const chameleonState = await network.getContractState(chameleonAddress);
    if (chameleonState.state.type !== "active") {
      throw new Error(`Failed to deploy ${chameleonAddress}`);
    }
  }
}

export const deployViaChameleon = async (network: NetworkProvider, config: DeployConfig, nonces: bigint[]): Promise<DeployResult> => {
  const ui = network.ui();
  const chameleonContractFilename = "chameleon-contract.fc";
  const path = getCheckerPath(chameleonContractFilename);
  const chameleonContract = Cell.fromBase64(await compileFuncFileToBase64Boc(path, chameleonContractFilename));
  const chameleonStateInit: StateInit = {
    code: chameleonContract,
    data: nonces
      .reduce((prevCell: Builder, nextNoncePart: bigint) => prevCell.storeInt(nextNoncePart, 32), beginCell())
      .endCell(),
  };
  const chameleonAddress = contractAddress(0, chameleonStateInit);
  const tonsForSendingMessageInput =
    await ui.input(`Enter amount of TONs for deployment message (suggested: ${config.suggestedValue + config.suggestedBalance} + fees):`);

  const tonsForSendingMessage = toNano(tonsForSendingMessageInput);
  const messageToChameleon = beginCell().storeRef(config.data).storeRef(config.code).endCell();
  await ensureDeployed(network, chameleonAddress, chameleonStateInit, tonsForSendingMessage, messageToChameleon);
  const chameleonState = await network.getContractState(chameleonAddress);
  if (chameleonState.state.type !== "active") {
    throw new Error(`Failed to deploy ${chameleonAddress}`);
  }
  return {
    address: chameleonAddress,
    balance: chameleonState.balance,
  };
};


export interface ReproduceParameters {
  address: Address;
  msgBody: Cell;
  suggestedValue: bigint;
}

export const reproduce = async (network: NetworkProvider, config: ReproduceParameters) => {
  const ui = network.ui();
  ui.write(`Number of TONs for reproduction message: ${Number(config.suggestedValue) / 1e9}`);
  ui.write(`${Sym.WAIT} Sending a reproduction message`);
  await network.sender().send({
    to: config.address,
    value: config.suggestedValue,
    body: config.msgBody,
  });

  await network.waitForLastTransaction(DEPLOY_WAIT_ATTEMPTS);

  ui.write(`${Sym.OK} Reproduction message sent!`);
};