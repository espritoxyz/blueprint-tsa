import { Cell } from "@ton/core";
import { UIProvider } from "@ton/blueprint";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { AnalyzerWrapper } from "./analyzer-wrapper.js";
import { TreeProperty } from "./draw.js";

export interface OpcodeExtractorConfig {
  ui: UIProvider;
  codePath: string;
  contractName: string;
}

export async function extractOpcodes(config: OpcodeExtractorConfig): Promise<number[]> {
  config.ui.write("");
  config.ui.write("Extracting contract opcodes for better path selection strategy...");

  const properties: TreeProperty[] = [
    { key: "Contract", value: config.contractName },
    { key: "Mode", value: "Opcode extraction" },
  ];

  // Create a temporary file for opcode output
  const outputFile = join(tmpdir(), `opcodes-${randomBytes(8).toString("hex")}.txt`);

  const analyzer = new AnalyzerWrapper({
    ui: config.ui,
    checkerPath: null,
    checkerCell: new Cell(),
    properties,
    codePath: config.codePath,
  });

  const args = [
    "opcodes",
    "--input",
    config.codePath,
    "--output",
    outputFile,
  ];

  try {
    await analyzer.run(null, () => args);

    // Read and parse the output file
    const content = readFileSync(outputFile, "utf-8").trim();
    const opcodes = content.split(",").map((op) => parseInt(op.trim(), 10));

    config.ui.write(`Extracted opcodes: [${opcodes.map((op) => `0x${op.toString(16).padStart(8, "0")}`).join(", ")}]`);

    return opcodes;
  } finally {
    // Clean up temporary file
    unlinkSync(outputFile);
  }
}
