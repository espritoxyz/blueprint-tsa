import { UIProvider } from "@ton/blueprint";
import { Address } from "@ton/core";
import { Sym, DRAIN_CHECK_ID } from "../common/constants.js";
import { drainCheckConcrete } from "../commands/drain-check.js";

export interface ConcreteAnalysisConfig {
  codePath: string;
  dataPath: string;
  balance: bigint;
  contractAddress: Address;
  senderAddress: Address;
  ui: UIProvider;
  timeout?: number;
};

export const runConcreteAnalysis = async (mode: string, config: ConcreteAnalysisConfig) => {
  const ui = config.ui;
  if (mode == DRAIN_CHECK_ID) {
    await drainCheckConcrete(config);
  } else {
    ui.write(`${Sym.ERR} Invalid command: ${mode}`);
    process.exit(1);
  }
};
