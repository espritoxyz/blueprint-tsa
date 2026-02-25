import { UIProvider } from "@ton/blueprint";
import path from "path";
import { existsSync } from "fs";
import { getReproduceConfigPath } from "../common/paths.js";

const REPRODUCE_INSTRUCTION_HEADER =
  "To reproduce the vulnerability on the blockchain, run:";
const REPRODUCE_COMMAND_PREFIX = "> yarn blueprint tsa reproduce --config";

export const printCleanupInstructions = (ui: UIProvider): void => {
  ui.write("");
  ui.write("To clean reports, run:");
  ui.write("> yarn blueprint tsa clean");
  ui.write("");
};

export const getReproductionInstructions = (analyzerId: string): string => {
  const configPath = getReproduceConfigPath(analyzerId);
  if (existsSync(configPath)) {
    const relativeConfigPath = path.relative(process.cwd(), configPath);
    return `${REPRODUCE_INSTRUCTION_HEADER}\n${REPRODUCE_COMMAND_PREFIX} ${relativeConfigPath}`;
  }
  return "";
};

export const printReproductionInstructions = (
  ui: UIProvider,
  analyzerId: string,
): void => {
  const instructions = getReproductionInstructions(analyzerId);
  if (instructions) {
    ui.write(instructions);
  }
};
