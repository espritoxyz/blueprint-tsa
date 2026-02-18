import {UIProvider} from "@ton/blueprint";
import {Address} from "@ton/core";
import {Sym} from "../common/constants.js";
import {drainCheckConcrete} from "../commands/drain-check.js";
import {ReproduceParameters} from "./network.js";
import {ownerHijackCheckConcrete} from "../commands/owner-hijack-check.js";
import {ConcreteCheckerOptions} from "./reproduce-config.js";


export interface ConcreteAnalysisConfig {
  codePath: string;
  dataPath: string;
  balance: bigint;
  contractAddress: Address;
  senderAddress: Address;
  ui: UIProvider;
  timeout: number | null;
  concreteCheckerOptions: ConcreteCheckerOptions
}

export const runConcreteAnalysis = async (mode: string, config: ConcreteAnalysisConfig): Promise<ReproduceParameters | null> => {
  const ui = config.ui;
  const concreteCheckerOptions = config.concreteCheckerOptions;
  if (concreteCheckerOptions.kind === "drain-check") {
    return await drainCheckConcrete(config);
  } else if (concreteCheckerOptions.kind === "owner-hijack-check") {
    return await ownerHijackCheckConcrete(config, concreteCheckerOptions);
  } else {
    ui.write(`${Sym.ERR} Invalid command: ${mode}`);
    process.exit(1);
  }
};
