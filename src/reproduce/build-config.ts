import { writeFileSync } from "fs";
import { VulnerabilityDescription } from "../common/analyzer-wrapper.js";
import { getReproduceConfigPath } from "../common/paths.js";
import { DEPLOY_AND_REPRODUCE_COMMAND } from "../common/constants.js";
import {
  ConcreteCheckerOptions,
  TsaVulnerabilityConfig,
} from "./reproduce-config.js";

export const writeReproduceConfig = (
  vulnerability: VulnerabilityDescription,
  command: string,
  timeout: number | null,
  id: string,
  concreteCheckerOptions: ConcreteCheckerOptions,
): void => {
  if (vulnerability.value == null) {
    throw new Error("Unexpected external message");
  }

  const config: TsaVulnerabilityConfig = {
    mode: DEPLOY_AND_REPRODUCE_COMMAND,
    command,
    codePath: vulnerability.codePath,
    dataPath: vulnerability.dataPath,
    suggestedValue: vulnerability.value.toString(),
    suggestedBalance: vulnerability.balance.toString(),
    timeout,
    concreteCheckerOptions,
  };
  const filePath = getReproduceConfigPath(id);
  writeFileSync(filePath, JSON.stringify(config));
};
