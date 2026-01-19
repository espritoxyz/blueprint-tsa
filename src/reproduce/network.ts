import { Cell, toNano, contractAddress, beginCell, StateInit } from '@ton/core';
import { NetworkProvider, UIProvider } from "@ton/blueprint";
import { Sym } from "../common/constants.js"

export const deployAndReproduce = async (network: NetworkProvider, ui: UIProvider, code: Cell, data: Cell) => {
  const stateInit: StateInit = {
    code,
    data,
  };

  const address = contractAddress(0, stateInit);

  let valueMessage = "Enter amount of TONs for deployment and reproduction message:"

  let isDeployed = await network.isContractDeployed(address);

  if (isDeployed) {
    const state = await network.getContractState(address);
    if (state.state.type == "frozen") {
      ui.write(`${Sym} contract at ${address} is frozen.`);
      process.exit(1);

    } else if (state.state.type == "uninit") {
      isDeployed = false;

    } else if (state.state.type == "active") {
      const actualData = state.state.data;

      if (actualData) {
        const actualDataCell = Cell.fromBoc(actualData)[0];

        const isDataMatching = actualDataCell.equals(data);

        if (!isDataMatching) {
          ui.write(`${Sym.ERR} Contract at ${address} is already deployed and its data does not match expected data.`);
          process.exit(1);
        } else {
          ui.write(`Contract is already deployed and its data matches with the expected one.`);
          valueMessage = "Enter amount of TONs for reproduction message:"
        }
      } else {
        ui.write(`${Sym.ERR} Contract at ${address} is already deployed. Cannot extract contract data to compare.`);
        process.exit(1);
      }
    } else {
      throw new Error(`Unexpected contract state: ${state.state}`);
    }
  }

  const tonsForDeploy = await ui.input(valueMessage);

  await network.sender().send({
    to: address,
    init: stateInit,
    value: toNano(tonsForDeploy),
  });

  if (!isDeployed) {
    await network.waitForDeploy(address, 40);
  } else {
    await network.waitForLastTransaction(40);
  }
}
