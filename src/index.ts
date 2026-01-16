import { Plugin, PluginRunner } from "@ton/blueprint";
import { tsa } from "./tsa.js";
import { tsaReproduce } from "./reproduce/tsa-reproduce.js";

export class TsaPlugin implements Plugin {
  runners(): PluginRunner[] {
    return [
      {
        name: "tsa",
        runner: tsa,
        help: "TODO",
      },
      {
        name: "tsa-reproduce",
        runner: tsaReproduce,
        help: "TODO",
      },
    ];
  }
}
