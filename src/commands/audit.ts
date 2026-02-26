import { Argv } from "yargs";
import yargs from "yargs";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { CommandContext, CommandHandler } from "../cli.js";
import {
  AUDIT_ID,
  Sym,
  DRAIN_CHECK_ID,
  REPLAY_ATTACK_CHECK_ID,
  OWNER_HIJACK_CHECK_ID,
  BOUNCE_CHECK_ID,
  DRAIN_CHECK_NAME,
  REPLAY_ATTACK_CHECK_NAME,
  OWNER_HIJACK_CHECK_NAME,
  BOUNCE_CHECK_NAME,
} from "../common/constants.js";
import { buildContracts } from "../common/build-utils.js";
import {
  findCompiledContract,
  findTSAReportsDirectory,
  getInputsPath,
} from "../common/paths.js";
import { generateReportId, formatOpcodeHex } from "../common/format-utils.js";
import { extractOpcodes } from "../common/opcode-extractor.js";
import { UIProvider } from "@ton/blueprint";
import { getMethodId } from "@ton/core";
import {
  printCleanupInstructions,
  getReproductionInstructions,
} from "../reproduce/utils.js";
import { runDrainCheckAnalysis } from "./drain-check.js";
import { runReplayAttackCheckAnalysis } from "./replay-attack-check.js";
import { runOwnerHijackCheckAnalysis } from "./owner-hijack-check.js";
import { runBounceCheckAnalysis } from "./bounce-check.js";
import {
  runOpcodeAuthorizationCheckAnalysis,
  formatOpcodeInfo,
  OpcodeInfo,
} from "./opcode-info.js";

const ONE_MINUTE_SECONDS = 60;

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  vulnerabilityPath?: string;
  analyzerId?: string;
  checkCommand: string;
}

interface AuditSummary {
  contract: string;
  checks: CheckResult[];
  opcodeInfo: OpcodeInfo[];
}

function getCheckCommand(
  checkName: string,
  contractName: string,
  timeout: number | null,
  ownerMethod?: string,
): string {
  let commandId: string | undefined;

  if (checkName === DRAIN_CHECK_NAME) {
    commandId = DRAIN_CHECK_ID;
  } else if (checkName === REPLAY_ATTACK_CHECK_NAME) {
    commandId = REPLAY_ATTACK_CHECK_ID;
  } else if (checkName === OWNER_HIJACK_CHECK_NAME) {
    commandId = OWNER_HIJACK_CHECK_ID;
  } else if (checkName === BOUNCE_CHECK_NAME) {
    commandId = BOUNCE_CHECK_ID;
  }

  if (!commandId) {
    throw new Error(`Unknown check: ${checkName}`);
  }

  let command = `yarn blueprint tsa ${commandId} -c ${contractName}`;
  if (timeout !== null) {
    command += ` -t ${timeout}`;
  }
  if (ownerMethod !== undefined && checkName === OWNER_HIJACK_CHECK_NAME) {
    command += ` -m ${ownerMethod}`;
  }

  return command;
}

function buildCheckResult(
  checkName: string,
  analyzer: any,
  passedMessage: string,
  failedMessage: string,
  contractName: string,
  timeout: number | null,
  ownerMethod?: string,
): CheckResult {
  const vulnerability = analyzer.vulnerabilityIsPresent();
  const result: CheckResult = {
    name: checkName,
    passed: !vulnerability,
    message: vulnerability ? failedMessage : passedMessage,
    checkCommand: getCheckCommand(
      checkName,
      contractName,
      timeout,
      ownerMethod,
    ),
  };

  if (vulnerability) {
    const vulnDesc = analyzer.getVulnerability();
    if (vulnDesc) {
      result.vulnerabilityPath = getInputsPath(
        analyzer.id,
        vulnDesc.executionIndex,
      );
      result.analyzerId = analyzer.id;
    }
  }

  return result;
}

async function runOpcodeInfoCheck(
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  opcodes: number[],
  verbose: boolean,
): Promise<OpcodeInfo[]> {
  // Calculate timeout per opcode
  let opcodeTimeout: number | null = null;
  if (timeout !== null && opcodes.length > 0) {
    opcodeTimeout = Math.floor(timeout / opcodes.length);
    ui.write("");
    ui.write(
      `Opcode authorization check: using timeout of ${opcodeTimeout} seconds per opcode (${timeout} / ${opcodes.length})`,
    );
  }

  const results: OpcodeInfo[] = [];
  for (const opcode of opcodes) {
    const info = await runOpcodeAuthorizationCheckAnalysis(
      opcode,
      contractName,
      contractPath,
      ui,
      opcodeTimeout,
      `Authorization check for ${formatOpcodeHex(opcode)} completed.`,
      verbose,
    );

    if (info !== null) {
      results.push(info);
    }
  }

  return results;
}

async function runDrainCheck(
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  opcodes: number[],
  verbose: boolean,
): Promise<CheckResult> {
  const analyzer = await runDrainCheckAnalysis(
    contractName,
    contractPath,
    ui,
    timeout,
    opcodes,
    verbose,
    `${DRAIN_CHECK_NAME} completed.`,
  );

  return buildCheckResult(
    DRAIN_CHECK_NAME,
    analyzer,
    "No drain vulnerabilities detected",
    "Vulnerability found - contract may be vulnerable to drain attacks",
    contractName,
    timeout,
  );
}

async function runReplayAttackCheck(
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  verbose: boolean,
): Promise<CheckResult> {
  const analyzer = await runReplayAttackCheckAnalysis(
    contractName,
    contractPath,
    ui,
    timeout,
    verbose,
    `${REPLAY_ATTACK_CHECK_NAME} completed.`,
  );

  return buildCheckResult(
    REPLAY_ATTACK_CHECK_NAME,
    analyzer,
    "No replay attack vulnerabilities detected",
    "Vulnerability found - contract may be vulnerable to replay attacks",
    contractName,
    timeout,
  );
}

async function runOwnerHijackCheck(
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  methodName: string,
  opcodes: number[],
  verbose: boolean,
): Promise<CheckResult> {
  const methodId = BigInt(getMethodId(methodName));

  const analyzer = await runOwnerHijackCheckAnalysis(
    contractName,
    contractPath,
    ui,
    timeout,
    methodId,
    opcodes,
    verbose,
    `${OWNER_HIJACK_CHECK_NAME} completed.`,
  );

  return buildCheckResult(
    OWNER_HIJACK_CHECK_NAME,
    analyzer,
    "No owner hijack vulnerabilities detected",
    "Vulnerability found - contract owner may be hijackable",
    contractName,
    timeout,
    methodName,
  );
}

async function runBounceCheck(
  contractName: string,
  contractPath: string,
  ui: UIProvider,
  timeout: number | null,
  opcodes: number[],
  verbose: boolean,
): Promise<CheckResult> {
  const analyzer = await runBounceCheckAnalysis(
    contractName,
    contractPath,
    ui,
    timeout,
    opcodes,
    verbose,
    `${BOUNCE_CHECK_NAME} completed.`,
  );

  return buildCheckResult(
    BOUNCE_CHECK_NAME,
    analyzer,
    "No bounce message handling vulnerabilities detected",
    "Vulnerability found - contract may not handle bounced messages correctly",
    contractName,
    timeout,
  );
}

function buildAuditReport(summary: AuditSummary): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("═".repeat(60));
  lines.push(`  AUDIT SUMMARY: ${summary.contract}`);
  lines.push("═".repeat(60));
  lines.push("");

  // Add opcode information
  if (summary.opcodeInfo.length > 0) {
    const opcodeInfoFormatted = formatOpcodeInfo(summary.opcodeInfo);
    lines.push(opcodeInfoFormatted);
  }

  // Add check results
  lines.push("Security Checks:");
  lines.push("");
  let allPassed = true;
  for (const check of summary.checks) {
    const status = check.passed ? Sym.OK : Sym.ERR;
    lines.push(`  ${status} ${check.name}: ${check.message}`);
    if (check.vulnerabilityPath) {
      const relativePath = path.relative(
        process.cwd(),
        check.vulnerabilityPath,
      );
      lines.push(`     Path to reproducing input: ${relativePath}`);
    }
    lines.push("");
    if (!check.passed) {
      allPassed = false;
    }
  }

  lines.push("─".repeat(60));
  if (allPassed) {
    lines.push(`  ${Sym.OK} All checks passed!`);
  } else {
    lines.push(`  ${Sym.WARN} Some checks failed - review the results above`);
  }
  lines.push("─".repeat(60));
  lines.push("");

  let report = lines.join("\n");

  // Add vulnerability instructions for checks with vulnerabilities
  const vulnerabilityInstructions: string[] = [];
  for (const check of summary.checks) {
    if (check.analyzerId) {
      const instructions = getReproductionInstructions(check.analyzerId);
      vulnerabilityInstructions.push("─".repeat(60));
      vulnerabilityInstructions.push(`  ${check.name}`);
      vulnerabilityInstructions.push("─".repeat(60));
      vulnerabilityInstructions.push("To run only this check, use:");
      vulnerabilityInstructions.push(`> ${check.checkCommand}`);
      vulnerabilityInstructions.push("");
      if (instructions) {
        vulnerabilityInstructions.push(instructions);
        vulnerabilityInstructions.push("");
      }
    }
  }

  report += "\n";
  if (vulnerabilityInstructions.length > 0) {
    report += vulnerabilityInstructions.join("\n");
  }

  return report;
}

function printAuditSummary(summary: AuditSummary, ui: UIProvider): void {
  const report = buildAuditReport(summary);
  ui.write(report);
}

function saveAuditReport(summary: AuditSummary, ui: UIProvider): string {
  const report = buildAuditReport(summary);
  const reportsDir = findTSAReportsDirectory();
  const reportId = generateReportId();
  const fileName = `audit-${summary.contract}-${reportId}.txt`;
  const filePath = path.join(reportsDir, fileName);

  writeFileSync(filePath, report);

  ui.write("");
  ui.write(`${Sym.OK} Report saved to: ${filePath}`);

  return filePath;
}

const auditHandler: CommandHandler = async (
  context: CommandContext,
  args: yargs.ArgumentsCamelCase,
) => {
  const { ui } = context;
  const { timeout, contract, ownerMethod, disableOpcodeExtraction, verbose } =
    args;

  await buildContracts(ui);
  const contractPath = findCompiledContract(contract as string);

  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${contract} not found`);
    process.exit(1);
  }

  // Extract opcodes if not disabled
  let opcodes: number[] = [];
  if (!disableOpcodeExtraction) {
    opcodes = await extractOpcodes({
      ui,
      codePath: contractPath,
      contractName: contract as string,
    });
  }

  // Calculate timeout if not provided
  // Timeout is per analyzer run (except for opcode-info where it's divided by number of opcodes)
  let effectiveTimeout = (timeout as number) ?? null;
  if (effectiveTimeout === null && opcodes.length > 0) {
    effectiveTimeout = ONE_MINUTE_SECONDS * (opcodes.length + 1);
    ui.write("");
    ui.write(
      `Timeout was calculated automatically: ${effectiveTimeout} seconds per analyzer run (based on ${opcodes.length} opcodes)`,
    );
  }

  const summary: AuditSummary = {
    contract: contract as string,
    checks: [],
    opcodeInfo: [],
  };

  // Run opcode-info check
  ui.write("");
  ui.write(`${Sym.WAIT} Running opcode authorization analysis...`);
  summary.opcodeInfo = await runOpcodeInfoCheck(
    contract as string,
    contractPath,
    ui,
    effectiveTimeout,
    opcodes,
    verbose as boolean,
  );

  // Run drain-check
  ui.write("");
  ui.write(`${Sym.WAIT} Running drain check...`);
  const drainResult = await runDrainCheck(
    contract as string,
    contractPath,
    ui,
    effectiveTimeout,
    opcodes,
    verbose as boolean,
  );
  summary.checks.push(drainResult);

  // Run replay-attack-check
  ui.write("");
  ui.write(`${Sym.WAIT} Running replay attack check...`);
  const replayResult = await runReplayAttackCheck(
    contract as string,
    contractPath,
    ui,
    effectiveTimeout,
    verbose as boolean,
  );
  summary.checks.push(replayResult);

  // Run bounce-check
  ui.write("");
  ui.write(`${Sym.WAIT} Running bounce check...`);
  const bounceResult = await runBounceCheck(
    contract as string,
    contractPath,
    ui,
    effectiveTimeout,
    opcodes,
    verbose as boolean,
  );
  summary.checks.push(bounceResult);

  // Run owner-hijack-check if owner method is provided
  if (ownerMethod) {
    ui.write("");
    ui.write(`${Sym.WAIT} Running owner hijack check...`);
    const ownerResult = await runOwnerHijackCheck(
      contract as string,
      contractPath,
      ui,
      effectiveTimeout,
      ownerMethod as string,
      opcodes,
      verbose as boolean,
    );
    summary.checks.push(ownerResult);
  } else {
    ui.write("");
    ui.write(
      `${Sym.WARN} Owner-method was not specified - owner hijack check is skipped`,
    );
  }

  // Print summary
  printAuditSummary(summary, ui);

  // Save report to file
  saveAuditReport(summary, ui);

  printCleanupInstructions(ui);
};

export const configureAuditCommand = (context: CommandContext) => {
  return {
    command: AUDIT_ID,
    description: "Run all available security checks and print a summary",
    builder: (yargs: Argv) =>
      yargs
        .option("contract", {
          alias: "c",
          type: "string",
          description: "Contract name",
          demandOption: true,
        })
        .option("timeout", {
          alias: "t",
          type: "number",
          description:
            "Analysis timeout in seconds per analyzer run (for opcode-info, divided by number of opcodes)",
        })
        .option("owner-method", {
          alias: "m",
          type: "string",
          description:
            "The method name of get_owner getter (optional, enables owner hijack check)",
        })
        .option("disable-opcode-extraction", {
          type: "boolean",
          description:
            "Disable opcode extraction. This affects path selection strategy and default timeout.",
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          description: "Use debug output in TSA log",
        }),
    handler: async (argv: yargs.ArgumentsCamelCase) => {
      await auditHandler(context, argv);
    },
  };
};
