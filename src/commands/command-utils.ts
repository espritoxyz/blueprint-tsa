import { existsSync, readFileSync } from "fs";
import path from "path";
import { UIProvider } from "@ton/blueprint";
import { FETCH_CONTRACT_ID, Sym } from "../common/constants.js";
import {
  findCompiledContract,
  getRemoteContractDataPath,
  getRemoteContractMetaPath,
  getRemoteContractPath,
} from "../common/paths.js";
import { buildAllContracts } from "../common/build-utils.js";
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
const OPCODE_EXTRACTION_DURATION_LABEL = "up to 40 seconds";

export const resolveBuiltContract = (
  ui: UIProvider,
  contractName: string,
): string => {
  const contractPath = findCompiledContract(contractName);
  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${contractName} not found`);
    ui.write(
      `Expected a compiled project contract at ${path.relative(process.cwd(), contractPath)} ` +
        `or a fetched contract at ${path.relative(process.cwd(), getRemoteContractPath(contractName))}.`,
    );
    ui.write(
      `To analyze a deployed contract, fetch it first: yarn blueprint tsa ${FETCH_CONTRACT_ID}`,
    );
    process.exit(1);
  }
  return contractPath;
};

const describeRemoteContract = (contractName: string): string | null => {
  const metaPath = getRemoteContractMetaPath(contractName);
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    const parts: string[] = [];
    if (typeof meta.address === "string") {
      parts.push(`address ${meta.address}`);
    }
    if (typeof meta.network === "string") {
      parts.push(meta.network);
    }
    if (typeof meta.timestamp === "number") {
      parts.push(`state at ${new Date(meta.timestamp * 1000).toISOString()}`);
    }
    if (typeof meta.balance === "string") {
      parts.push(`balance ${meta.balance} nanotons`);
    }
    return parts.length > 0 ? parts.join(", ") : null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return null;
  }
};

export interface PreparedContract {
  /** Path to the contract code (compiled artifact or fetched BoC) */
  codePath: string;
  /** Path to a .boc file with concrete contract data, or null for symbolic data */
  dataPath: string | null;
}

/**
 * Validates the --data CLI option.
 * Returns null when the option is not set (symbolic data).
 * Exits with an error message when the file does not exist.
 */
export const parseDataArg = (
  ui: UIProvider,
  rawData: string | undefined,
): string | null => {
  if (rawData === undefined) {
    return null;
  }
  if (!existsSync(rawData)) {
    ui.write(`\n${Sym.ERR} Contract data file not found at ${rawData}`);
    process.exit(1);
  }
  return rawData;
};

const resolveRemoteContractData = async (
  ui: UIProvider,
  contractName: string,
  explicitDataPath: string | null,
  interactive: boolean,
): Promise<string | null> => {
  if (explicitDataPath !== null) {
    return explicitDataPath;
  }

  const fetchedDataPath = getRemoteContractDataPath(contractName);
  if (!existsSync(fetchedDataPath)) {
    return null;
  }

  const relativeDataPath = path.relative(process.cwd(), fetchedDataPath);
  if (!isInteractiveEnabled(interactive)) {
    ui.write(
      `Fetched contract data found at ${relativeDataPath}, but the analysis uses symbolic data by default. ` +
        `Pass --data ${relativeDataPath} to analyze with the concrete data.`,
    );
    return null;
  }

  const useConcreteData = await ui.prompt(
    `Concrete contract data was fetched along with this contract (${relativeDataPath}). Use it instead of symbolic data?`,
  );
  return useConcreteData ? fetchedDataPath : null;
};

/**
 * Resolves a contract name to paths with contract code and data.
 *
 * Contracts fetched from the blockchain (stored in tsa/boc) take precedence;
 * otherwise all project contracts are built and the compiled artifact is used.
 *
 * For fetched contracts with stored concrete data, in interactive mode the
 * user is asked whether to analyze with the concrete or symbolic data
 * (unless --data was given explicitly).
 */
export const prepareContract = async (
  ui: UIProvider,
  contractName: string,
  interactive: boolean,
  explicitDataPath: string | null = null,
): Promise<PreparedContract> => {
  const remotePath = getRemoteContractPath(contractName);
  if (existsSync(remotePath)) {
    const details = describeRemoteContract(contractName);
    ui.write(
      `${Sym.OK} Using contract fetched from the blockchain: ${path.relative(process.cwd(), remotePath)}` +
        (details !== null ? ` (${details})` : ""),
    );
    const dataPath = await resolveRemoteContractData(
      ui,
      contractName,
      explicitDataPath,
      interactive,
    );
    return { codePath: remotePath, dataPath };
  }

  await buildAllContracts(ui, interactive);
  return {
    codePath: resolveBuiltContract(ui, contractName),
    dataPath: explicitDataPath,
  };
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

/**
 * Parses the --balance CLI option into nanotons.
 * Returns null when the option is not set (symbolic balance).
 * Exits with an error message on invalid input.
 */
export const parseBalanceArg = (
  ui: UIProvider,
  rawBalance: string | undefined,
): bigint | null => {
  if (rawBalance === undefined) {
    return null;
  }
  let balance: bigint;
  try {
    balance = BigInt(rawBalance);
  } catch {
    ui.write(
      `\n${Sym.ERR} Invalid balance '${rawBalance}': expected an integer number of nanotons`,
    );
    process.exit(1);
  }
  if (balance < 0n) {
    ui.write(`\n${Sym.ERR} Balance must not be negative, got ${balance}`);
    process.exit(1);
  }
  return balance;
};

export const isInteractiveEnabled = (interactive?: boolean): boolean =>
  interactive !== false &&
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true;

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
      interactive: opts.interactive,
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
