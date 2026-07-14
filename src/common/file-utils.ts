import { existsSync, readFileSync, unlinkSync } from "fs";
import { Cell } from "@ton/core";

/**
 * Loads contract code from either a Blueprint compiled artifact
 * (JSON with a `hex` field) or a raw BoC file (e.g. fetched from
 * the blockchain into tsa/boc).
 * @param codePath - Path to the contract code file
 * @returns The contract code cell
 */
export function loadContractCodeCell(codePath: string): Cell {
  if (codePath.endsWith(".json")) {
    const codeHex = JSON.parse(readFileSync(codePath, "utf-8")).hex;
    return Cell.fromBoc(Buffer.from(codeHex, "hex"))[0];
  }
  return Cell.fromBoc(readFileSync(codePath))[0];
}

/**
 * Executes a function with a temporary file, ensuring cleanup in all cases
 * @param callback - Function that receives the temporary file path and returns a promise
 * @param tempFilePath - Path to the temporary file to create and clean up
 * @returns The result of the callback function
 */
export async function doWithTemporaryFile<T>(
  callback: (tempFilePath: string) => Promise<T>,
  tempFilePath: string,
): Promise<T> {
  try {
    return await callback(tempFilePath);
  } finally {
    if (existsSync(tempFilePath)) {
      unlinkSync(tempFilePath);
    }
  }
}
