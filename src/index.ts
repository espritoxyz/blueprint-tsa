import { Plugin, PluginRunner } from "@ton/blueprint";
import { tsa } from "./tsa.js";

export class TsaPlugin implements Plugin {
  runners(): PluginRunner[] {
    return [
      {
        name: "tsa",
        runner: tsa,
        help: "TON Symbolic Analyzer",
      },
    ];
  }
}
