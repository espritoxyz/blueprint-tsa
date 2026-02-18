import { createReadStream } from "fs";
import { Extract } from "unzipper";

export const extractZip = (
  zipPath: string,
  extractPath: string,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(Extract({ path: extractPath }))
      .on("close", resolve)
      .on("error", reject);
  });
};
