import { Cell, toNano, contractAddress, beginCell, StateInit, Address } from '@ton/core';
import { NetworkProvider, UIProvider } from "@ton/blueprint";
import { Sym } from "../common/constants.js";
import { ReproduceConfig } from "./tsa-reproduce.js";

export const deploy = async (network: NetworkProvider, ui: UIProvider, config: ReproduceConfig) => {
  const stateInit: StateInit = {
    code: config.code,
    data: config.data,
  };

  const address = contractAddress(0, stateInit);

  let isDeployed = await network.isContractDeployed(address);
  let suggestedValue = config.suggestedBalance;

  if (isDeployed) {
    const state = await network.getContractState(address);
    if (state.state.type == "frozen") {
      ui.write(`${Sym} contract at ${address} is frozen.`);
      process.exit(1);

    } else if (state.state.type == "uninit") {
      isDeployed = false;
      ui.write(`Contract at ${address} is uninit. Current balance: ${state.balance}.`);
      suggestedValue -= state.balance;

    } else if (state.state.type == "active") {
      const actualData = state.state.data;

      if (actualData) {
        const actualDataCell = Cell.fromBoc(actualData)[0];

        const isDataMatching = actualDataCell.equals(config.data);

        if (!isDataMatching) {
          ui.write(`${Sym.ERR} Contract at ${address} is already deployed and its data does not match expected data.`);
          process.exit(1);
        } else {
          ui.write(`Contract at ${address} is already deployed and its data matches with the expected one.`);
          ui.write(`Current balance: ${state.balance}.`)
          const proceed = await ui.choose(
            "Do you want to send more TONs?",
            [
              {
                "name": "Yes",
                "value": true,
              },
              {
                "name": "No",
                "value": false,
              },
            ],
            (c) => c.name,
          )
          if (!proceed.value) {
            return address;
          }
          suggestedValue -= state.balance;
        }
      } else {
        ui.write(`${Sym.ERR} Contract at ${address} is already deployed. Cannot extract contract data to compare.`);
        process.exit(1);
      }
    } else {
      throw new Error(`Unexpected contract state: ${state.state}`);
    }
  }

  if (suggestedValue < 0n) {
    suggestedValue = 0n;
  }
  const suggestedValueInTons = Number(suggestedValue) / 1e9;

  const tonsForDeploy =
    await ui.input(`Enter amount of TONs for deployment message (suggested: ${suggestedValueInTons} + fees):`);

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

   const state = await network.getContractState(address);
   if (state.state.type != "active") {
     throw new Error("Unexpected contract state");
   }

   let dataMatches = false;
   if (state.state.data) {
       const actualData = Cell.fromBoc(state.state.data)[0];
       dataMatches = actualData.equals(config.data);
   }

   if (!dataMatches) {
     ui.write(`${Sym.ERR} Contract data changed after receiving deployment message.`);
     process.exit(1);
   }

   ui.write(`${Sym.OK} Contract ${address} deployed. Balance: ${state.balance}.`);

   return address;
}

export const reproduce = async (network: NetworkProvider, ui: UIProvider, address: Address, config: ReproduceConfig) => {
  const suggestedValue = Number(config.suggestedValue) / 1e9
  const tonsForReproduce = await ui.input(`Enter amount of TONs for reproduce message (suggested: ${suggestedValue}):`);
  await network.sender().send({
    to: address,
    value: toNano(tonsForReproduce),
    body: config.msgBody,
  });

  await network.waitForLastTransaction(40);

  ui.write(`${Sym.OK} Reproduction message sent!`);
}