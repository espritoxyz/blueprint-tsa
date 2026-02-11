import path from "path";
import {Argv} from "yargs";
import {existsSync} from "fs";
import {beginCell} from "@ton/core";
import {TreeProperty} from "../common/draw.js";
import {CommandContext, CommandHandler} from "../cli.js";
import {AnalyzerWrapper} from "../common/analyzer-wrapper.js";
import {writeReproduceConfig} from "../reproduce/build-config.js";
import {
  ERROR_EXIT_CODE,
  OWNER_HIJACK_CHECK,
  OWNER_HIJACK_CHECK_ID,
  OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME,
  Sym
} from "../common/constants.js";
import {buildContracts} from "../common/build-utils.js";
import {printCleanupInstructions} from "../reproduce/utils.js";
import {
  findCompiledContract,
  getCheckerPath,
  getReportDirectory,
  getReproduceConfigPath,
  getSarifReportPath,
} from "../common/paths.js";
import {UIProvider} from "@ton/blueprint";

export const configureOwnerHijackCommand = (context: CommandContext): any => ({
  command: OWNER_HIJACK_CHECK,
  description: "Analyze contract for the possibility of owner hijack",
  builder: (yargs: Argv) =>
    yargs
      .option("timeout", {
        alias: "t",
        type: "number",
        description: "Analysis timeout in milliseconds",
      })
      .option("contract", {
        alias: "c",
        type: "string",
        description: "Contract name",
        demandOption: true,
      })
      .option("methodid", {
        alias: "m",
        type: "number",
        description: "The method id of get_owner getter",
        demandOption: true,
      })
      .option("verbose", {
        alias: "v",
        type: "boolean",
        description: "Use debug output in TSA log",
      }),
  handler: async (argv: any) => await ownerHijackCommand(context, argv),
});

const extractOptions = (ui: UIProvider, parsedArgs: any) => {
  const contract = parsedArgs.contract;
  if (typeof contract !== "string") {
    throw new Error("Contract name or path is required");
  }

  const timeout: number | null = parsedArgs.timeout ?? null;

  const methodId = parsedArgs.methodid;
  if (typeof methodId != "bigint") {
    ui.write("methodId required");
    process.exit(-1);
  }

  const options = {
    contract,
    timeout,
    methodId,
  };

  const properties: TreeProperty[] = [
    {key: "Contract", value: options.contract},
    {key: "Mode", value: "TON owner hijack"},
    {
      key: "Options",
      separator: true,
      children: [
        {key: "Timeout", value: options.timeout !== null ? `${(options.timeout)} seconds` : "not set"},
        {key: "Method id", value: options.methodId.toString()}
      ],
    },
  ];
  return {options, properties};
};


const ownerHijackCommand: CommandHandler = async (context: CommandContext, parsedArgs: any) => {
  const {ui} = context;
  await buildContracts(ui);
  const {options, properties} = extractOptions(ui, parsedArgs);

  const contractPath = findCompiledContract(options.contract);
  if (!existsSync(contractPath)) {
    ui.write(`\n${Sym.ERR} Contract ${(options.contract)} not found`);
    process.exit(1);
  }

  const checkerPath = getCheckerPath(OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME);
  const checkerCell = beginCell().storeUint(options.methodId, 32).endCell();
  const analyzer = new AnalyzerWrapper({
    ui,
    checkerPath,
    checkerCell,
    properties,
    codePath: contractPath,
  });

  const reportDir = getReportDirectory(analyzer.id);
  const sarifPath = getSarifReportPath(analyzer.id);

  await analyzer.run(OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME, wrapper => [
    "custom-checker-compiled",
    "--checker",
    wrapper.getTempBocPath(),
    "--contract",
    contractPath,
    "--stop-when-exit-codes-found",
    ERROR_EXIT_CODE.toString(),
    "--checker-data",
    wrapper.getTempCheckerCellPath(),
    "--output",
    sarifPath,
    ...(options.timeout != null ? ["--timeout", options.timeout.toString()] : []),
    "--exported-inputs",
    reportDir,
    ...(parsedArgs.verbose ? ["-v"] : []),
  ]);

  const vulnerability = analyzer.getVulnerability();
  analyzer.reportVulnerability(vulnerability);

  printCleanupInstructions(ui);

  if (vulnerability != null) {
    writeReproduceConfig(vulnerability, OWNER_HIJACK_CHECK_ID, options.timeout, analyzer.id);
    const configPath = getReproduceConfigPath(analyzer.id);
    const relativeConfigPath = path.relative(process.cwd(), configPath);
    ui.write("To reproduce the vulnerability on the blockchain, run:");
    ui.write(`> yarn blueprint tsa-reproduce ${relativeConfigPath}`);

    process.exit(2);
  }
};