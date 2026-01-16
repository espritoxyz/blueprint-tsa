import { ensureJavaInstalled } from "../install/java.js";
import { ensureTsaInstalled } from "../install/tsa-jar.js";
import { spawn } from "child_process";

export class Analyzer {
  javaPath: string;
  tsaJarPath: string;

  constructor(javaPath: string, tsaJarPath: string) {
    this.javaPath = javaPath;
    this.tsaJarPath = tsaJarPath;
  }

  static async create(): Promise<Analyzer> {
    const javaPath = await ensureJavaInstalled();
    const tsaJarPath = await ensureTsaInstalled();
    return new Analyzer(javaPath, tsaJarPath);
  }

  run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const allArgs = ["-jar", this.tsaJarPath, ...args];
      const proc = spawn(this.javaPath, allArgs);

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        console.log(data.toString());
        const chunk = data.toString();
        stdout += chunk;
      });

      proc.stderr?.on("data", (data) => {
        console.error(data.toString());
        const chunk = data.toString();
        stderr += chunk;
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          console.error("\n" + stderr);
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }
}
