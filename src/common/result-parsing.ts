import { readFileSync } from "fs";
import { EXPECTED_MESSAGE_IN_SARIF } from "./constants.js";

export const findExploitExecutionIndex = (sarifPath: string): number | undefined => {
  const sarifContent = readFileSync(sarifPath, "utf-8");
  const parsedObject = JSON.parse(sarifContent);

  const results = parsedObject.runs[0].results || [];

  const index = results.findIndex(
    (result: any) => result.message?.text === EXPECTED_MESSAGE_IN_SARIF
  );

  return index >= 0 ? index : undefined;
};

export const getMessageValue = (sarifPath: string, index: number): bigint => {
  const sarifContent = readFileSync(sarifPath, "utf-8");
  const parsedObject = JSON.parse(sarifContent);
  const results = parsedObject.runs[0].results || [];
  const result = results[index];
  return BigInt(result.properties.additionalInputs["0"].msgValue);
}