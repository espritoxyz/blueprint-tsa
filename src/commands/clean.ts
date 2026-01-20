import { rmSync } from "fs";
import { Argv } from "yargs";
import { findTSAReportsDirectory } from "../common/paths.js";

export const configureCleanCommand = (): any => {
  return {
    command: "clean",
    description: "Clean directory with reports",
    builder: (yargs: Argv) => yargs,
    handler: async (_argv: any) => {
      await cleanCommand();
    },
  };
};

const cleanCommand = async () => {
  const reportsDir = findTSAReportsDirectory();
  rmSync(reportsDir, { recursive: true, force: true });
};
