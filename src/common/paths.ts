import path from "path";

export const BUILD_DIR = path.join(process.cwd(), "build");

export const findCompiledContract = (name: string): string => {
  return path.join(BUILD_DIR, name + ".compiled.json");
};
