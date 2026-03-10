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
const SECONDS_PER_MINUTE = 60;
const LONG_RUNNING_ANALYSIS_HINT =
  "This analysis may take several minutes to finish.";
const OPCODE_EXTRACTION_HINT =
  "Opcode extraction may take up to 20 seconds before the analysis timeout is known.";
const TSA_OVERVIEW_LINES = [
  "TSA is a symbolic analysis tool for smart contracts.",
  "It explores contract behavior and checks whether specific security issues can be triggered.",
  "At the end of the run, you will get a summary of the checks and detected issues.",
  "For checks that support it, TSA will also provide reproduction details for confirmed vulnerabilities.",
] as const;
const AUTO_TIMEOUT_MESSAGE =
  "The timeout was calculated automatically based on the number of opcodes.";
const CONFIRMATION_DECLINED_MESSAGE =
  "Analysis was cancelled by the user before it started.";
const TIMEOUT_NOT_SET_LABEL = "not set";
const OPCODE_EXTRACTION_DURATION_LABEL = "up to 20 seconds";

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

export interface OpcodeExtractionPreflightOptions {
  commandLabel: string;
  contractName: string;
  interactive?: boolean;
}

export const hasExplicitTimeout = (
  timeout: number | null | undefined,
): boolean => timeout !== null && timeout !== undefined;

export const isInteractiveEnabled = (interactive?: boolean): boolean =>
  interactive !== false;

export const confirmOpcodeExtractionWait = async (
  ui: UIProvider,
  options: OpcodeExtractionPreflightOptions,
): Promise<void> => {
  if (!isInteractiveEnabled(options.interactive)) {
    return;
  }

  ui.write("");
  ui.write("TSA analysis overview:");
  for (const line of TSA_OVERVIEW_LINES) {
    ui.write(`- ${line}`);
  }
  ui.write("");
  ui.write(`${Sym.WARN} ${OPCODE_EXTRACTION_HINT}`);
  ui.write(`Command: ${options.commandLabel}`);
  ui.write(`Contract: ${options.contractName}`);
  ui.write(`Expected wait: ${OPCODE_EXTRACTION_DURATION_LABEL}`);
  ui.write("");
  ui.write(
    "After opcode extraction finishes, TSA will show the calculated timeout and ask for final confirmation.",
  );

  const shouldProceed = await ui.prompt(
    "Do you want to continue with TSA preparation?",
  );

  if (!shouldProceed) {
    ui.write(`${Sym.WARN} ${CONFIRMATION_DECLINED_MESSAGE}`);
    process.exit(0);
  }

  ui.write(`${Sym.OK} Starting opcode extraction...`);
};

const confirmAnalysisBeforePreparation = async (
  ui: UIProvider,
  options: AnalysisPreflightOptions,
): Promise<void> => {
  if (!hasExplicitTimeout(options.timeoutSeconds)) {
    return;
  }

  await confirmLongRunningAnalysis(ui, options);
};

export const resolveOpcodesAndTimeout = async (
  ui: UIProvider,
  contractName: string,
  contractPath: string,
  opts: {
    disableOpcodeExtraction?: boolean;
    explicitTimeout?: number | null;
    commandLabel?: string;
    interactive?: boolean;
  },
): Promise<OpcodesAndTimeout> => {
  let opcodes: number[] = [];
  if (!opts.disableOpcodeExtraction) {
    const hasUserProvidedTimeout = hasExplicitTimeout(opts.explicitTimeout);

    if (hasUserProvidedTimeout) {
      await confirmAnalysisBeforePreparation(ui, {
        commandLabel: opts.commandLabel ?? contractName,
        contractName,
        timeoutSeconds: opts.explicitTimeout ?? null,
        checkCount: 1,
        interactive: opts.interactive,
      });
    } else {
      await confirmOpcodeExtractionWait(ui, {
        commandLabel: opts.commandLabel ?? contractName,
        contractName,
        interactive: opts.interactive,
      });
    }

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
    ui.write(AUTO_TIMEOUT_MESSAGE);
  }

  return { opcodes, timeout };
};

const formatDuration = (timeoutSeconds: number | null): string => {
  if (timeoutSeconds === null) {
    return TIMEOUT_NOT_SET_LABEL;
  }

  const minutes = Math.ceil(timeoutSeconds / SECONDS_PER_MINUTE);
  const minuteLabel = minutes === 1 ? "minute" : "minutes";
  return `${timeoutSeconds} seconds (~${minutes} ${minuteLabel})`;
};

export interface AnalysisPreflightOptions {
  commandLabel: string;
  contractName: string;
  timeoutSeconds: number | null;
  opcodeCount?: number;
  checkCount?: number;
  interactive?: boolean;
}

export const confirmLongRunningAnalysis = async (
  ui: UIProvider,
  options: AnalysisPreflightOptions,
): Promise<void> => {
  if (!isInteractiveEnabled(options.interactive)) {
    return;
  }

  const details: string[] = [
    `${Sym.WARN} ${LONG_RUNNING_ANALYSIS_HINT}`,
    `Command: ${options.commandLabel}`,
    `Contract: ${options.contractName}`,
    `Timeout: ${formatDuration(options.timeoutSeconds)}`,
  ];

  if (options.opcodeCount !== undefined) {
    details.push(`Opcodes considered: ${options.opcodeCount}`);
  }

  if (options.checkCount !== undefined) {
    details.push(`Checks to run: ${options.checkCount}`);
  }

  details.push("");
  details.push(
    "You will see progress updates while TSA prepares and runs the analysis.",
  );

  ui.write("");
  for (const line of details) {
    ui.write(line);
  }

  const shouldProceed = await ui.prompt(
    "Do you want to start the analysis now?",
  );

  if (!shouldProceed) {
    ui.write(`${Sym.WARN} ${CONFIRMATION_DECLINED_MESSAGE}`);
    process.exit(0);
  }

  ui.write(`${Sym.OK} Starting analysis...`);
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
