import { existsSync } from "fs";
import { UIProvider } from "@ton/blueprint";
import { Sym } from "../common/constants.js";
import { findCompiledContract } from "../common/paths.js";
import { extractOpcodes } from "../common/opcode-extractor.js";
import { AnalyzerWrapper } from "../common/analyzer-wrapper.js";
import {
  printCleanupInstructions,
  printReproductionInstructions,
} from "../reproduce/utils.js";
import { toNano } from "@ton/core";

export const ONE_MINUTE_SECONDS = 60;

export const resolveBuiltContract = (
  ui: UIProvider,
  contractName: string,
): string => {
  const contractPath = findCompiledContract(contractName);
  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${contractName} not found`);
    process.exit(1);
  }
  return contractPath;
};

interface OpcodesAndTimeout {
  opcodes: number[];
  timeout: number | null;
}

export const resolveOpcodesAndTimeout = async (
  ui: UIProvider,
  contractName: string,
  contractPath: string,
  opts: {
    disableOpcodeExtraction?: boolean;
    explicitTimeout?: number | null;
  },
): Promise<OpcodesAndTimeout> => {
  let opcodes: number[] = [];
  if (!opts.disableOpcodeExtraction) {
    opcodes = await extractOpcodes({
      ui,
      codePath: contractPath,
      contractName,
    });
  }

  let timeout = opts.explicitTimeout ?? null;

  if (timeout === null && opcodes.length > 0) {
    timeout = ONE_MINUTE_SECONDS * (opcodes.length + 1);
    ui.write("");
    ui.write(
      "The timeout was calculated automatically based on the number of opcodes.",
    );
  }

  return { opcodes, timeout };
};

export const reportAndExit = (
  ui: UIProvider,
  analyzer: AnalyzerWrapper,
  descriptionUrl: string,
): void => {
  const vulnerability = analyzer.getVulnerabilityFromReport();
  analyzer.reportVulnerability(vulnerability, descriptionUrl);

  printCleanupInstructions(ui);

  if (vulnerability != null) {
    printReproductionInstructions(ui, analyzer.id);
    process.exit(2);
  }
};

export async function readNanotons(
  request: string,
  ui: UIProvider,
): Promise<bigint> {
  while (true) {
    const userInput = await ui.input(request);
    try {
      return toNano(userInput);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      ui.write(
        `Your input (${userInput}) was of not correct nanoton format. Please try again.`,
      );
    }
  }
}
