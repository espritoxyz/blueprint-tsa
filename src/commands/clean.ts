import { rmSync } from "fs";
import { CommandModule } from "yargs";
import { findTSAReportsDirectory } from "../common/paths.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function createCleanCommand(): CommandModule<{}, {}> {
  return {
    command: "clean",
    describe: "Clean directory with reports",
    builder: {},
    handler: async () => {
      await cleanCommand();
    },
  };
}

const cleanCommand = async () => {
  const reportsDir = findTSAReportsDirectory();
  rmSync(reportsDir, { recursive: true, force: true });
};
