import { existsSync, unlinkSync } from "fs";

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
