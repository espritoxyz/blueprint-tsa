import { readFileSync } from "fs";
import {
  EXPECTED_MESSAGE_IN_SARIF,
  EXPECTED_MESSAGE_NON_FAILING,
} from "./constants.js";

const findExecutionByMessage = (
  sarifPath: string,
  expectedMessage: string,
): number | undefined => {
  const sarifContent = readFileSync(sarifPath, "utf-8");
  const parsedObject = JSON.parse(sarifContent);

  const results = parsedObject.runs[0].results || [];

  const index = results.findIndex(
    // TODO add the proper parsing of SARIF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result: any) => result.message?.text === expectedMessage,
  );

  return index >= 0 ? index : undefined;
};

export const findExploitExecutionIndex = (
  sarifPath: string,
): number | undefined => {
  return findExecutionByMessage(sarifPath, EXPECTED_MESSAGE_IN_SARIF);
};

export const findNonFailingExecution = (
  sarifPath: string,
): number | undefined => {
  return findExecutionByMessage(sarifPath, EXPECTED_MESSAGE_NON_FAILING);
};

export const getMessageValue = (
  sarifPath: string,
  index: number,
): bigint | null => {
  const sarifContent = readFileSync(sarifPath, "utf-8");
  const parsedObject = JSON.parse(sarifContent);
  const results = parsedObject.runs[0].results || [];
  const result = results[index];
  const input = result.properties.additionalInputs["0"];
  if (input.type == "recvExternalInput") {
    return null;
  }
  return BigInt(input.msgValue);
};

export const getInitialBalance = (sarifPath: string, index: number): bigint => {
  const sarifContent = readFileSync(sarifPath, "utf-8");
  const parsedObject = JSON.parse(sarifContent);
  const results = parsedObject.runs[0].results || [];
  const result = results[index];
  return BigInt(result.properties.initialBalance["1"]);
};
