import { UIProvider, buildAll } from "@ton/blueprint";
import path from "path";

export class Sym {
  public static OK = "✅";
  public static WARN = "⚠️";
  public static ERR = "❌";
  public static WAIT = "⏳";
}

export const BUILD_DIR = path.join(process.cwd(), "build");

export const findCompiledContract = (name: string): string => {
  return path.join(BUILD_DIR, name + ".compiled.json");
};

export const buildContracts = async (ui: UIProvider) => {
  ui.setActionPrompt(`${Sym.WAIT} Compiling contracts...`);
  try {
    await buildAll(ui);
  } catch (e) {
    ui.clearActionPrompt();
    ui.write((e as any).toString());
    ui.write(`\n${Sym.ERR} Failed to compile one of the files`);
    ui.write("Please make sure you can run `blueprint build --all` successfully before running TSA.");
    process.exit(1);
  }
  ui.clearActionPrompt();
  ui.write(`${Sym.OK} Compiled.\n`);
};
