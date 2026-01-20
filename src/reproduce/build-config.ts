import { writeFileSync } from "fs";
import { VulnerabilityDescription } from "../common/analyzer-wrapper.js";
import { getReproduceConfigPath } from "../common/paths.js";

export const writeReproduceConfig = (
  vulnerability: VulnerabilityDescription,
  command: string,
  timeout: number | null,
  id: string
): void => {
  const config = {
    mode: "deploy-and-reproduce",
    command,
    codePath: vulnerability.codePath,
    dataPath: vulnerability.dataPath,
    suggestedValue: vulnerability.value.toString(),
    suggestedBalance: vulnerability.balance.toString(),
    timeout,
  };
  const filePath = getReproduceConfigPath(id);
  writeFileSync(filePath, JSON.stringify(config));
};
