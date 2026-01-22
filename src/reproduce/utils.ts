import { UIProvider } from "@ton/blueprint";

export const printCleanupInstructions = (ui: UIProvider): void => {
  ui.write("");
  ui.write("To clean reports, run:");
  ui.write("> yarn blueprint tsa clean");
  ui.write("");
};
