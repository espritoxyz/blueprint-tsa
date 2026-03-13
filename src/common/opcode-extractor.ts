import { Cell } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { AnalyzerWrapper } from "./analyzer-wrapper.js";
import { TreeProperty } from "./draw.js";
import { formatOpcodeHex } from "./format-utils.js";
import { doWithTemporaryFile } from "./file-utils.js";

const OPCODE_EXTRACTION_TIMEOUT_SECONDS = 20;

export interface OpcodeExtractorConfig {
  ui: UIProvider;
  codePath: string;
  contractName: string;
  interactive?: boolean;
}

export async function extractOpcodes(
  config: OpcodeExtractorConfig,
): Promise<number[]> {
  config.ui.write("");
  config.ui.write(
    "Extracting contract opcodes for better path selection strategy...",
  );

  const properties: TreeProperty[] = [
    { key: "Contract", value: config.contractName },
    { key: "Mode", value: "Opcode extraction" },
    {
      key: "Options",
      separator: true,
      children: [
        {
          key: "Timeout",
          value: `${OPCODE_EXTRACTION_TIMEOUT_SECONDS} seconds`,
        },
      ],
    },
  ];

  // Create a temporary file for opcode output
  const outputFile = join(
    tmpdir(),
    `opcodes-${randomBytes(8).toString("hex")}.txt`,
  );

  return doWithTemporaryFile(async (tempPath) => {
    const analyzer = new AnalyzerWrapper({
      ui: config.ui,
      checkerPath: null,
      checkerCell: new Cell(),
      properties,
      codePath: config.codePath,
      interactive: config.interactive ?? true,
      expectsSarifReport: false,
    });

    const args = [
      "opcodes",
      "--input",
      config.codePath,
      "--output",
      tempPath,
      "--timeout",
      OPCODE_EXTRACTION_TIMEOUT_SECONDS.toString(),
    ];

    await analyzer.run(null, () => args, "Opcode extraction completed.");

    // Read and parse the output file
    const content = readFileSync(tempPath, "utf-8").trim();

    if (content.length === 0) {
      config.ui.write("Extracted opcodes: []");
      return [];
    }

    const opcodes = content.split("\n").map((op) => parseInt(op.trim(), 10));

    config.ui.write(
      `Extracted opcodes: [${opcodes.map((op) => formatOpcodeHex(op)).join(", ")}]`,
    );

    return opcodes;
  }, outputFile);
}
