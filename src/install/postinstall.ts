#!/usr/bin/env node

/**
 * Postinstall script for blueprint-tsa
 * Runs after the package is installed
 */

const PAUSE_DURATION_MS = 10000;

const pause = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

async function main(): Promise<void> {
  console.log("Installing blueprint-tsa...");
  await pause(PAUSE_DURATION_MS);
  // process.exit(2);
}

main();
