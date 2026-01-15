import { UIProvider } from "@ton/blueprint";
import { Analyzer } from "./analyzer.js";

export class AnalyzerWrapper {
  private analyzer: Analyzer;

  private constructor(analyzer: Analyzer) {
    this.analyzer = analyzer;
  }

  static async create(): Promise<AnalyzerWrapper> {
    const analyzer = await Analyzer.create();
    return new AnalyzerWrapper(analyzer);
  }

  async run(args: string[], ui: UIProvider): Promise<void> {
    await this.analyzer.run(args);
  }
}
