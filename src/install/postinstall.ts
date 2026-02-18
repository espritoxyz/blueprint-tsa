import { ensureJavaInstalled } from "./java.js";
import { ensureTsaInstalled } from "./tsa-jar.js";

/**
 * Postinstall script for blueprint-tsa
 * Runs after the package is installed
 */

async function main(): Promise<void> {
  await Promise.all([ensureJavaInstalled(), ensureTsaInstalled()]);
}

main();
