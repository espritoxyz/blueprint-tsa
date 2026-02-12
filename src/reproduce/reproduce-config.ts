import * as z from "zod";


export const TsaVulnerabilityConfigSchema = z.object({
  mode: z.string(),
  command: z.string(),
  codePath: z.string(),
  dataPath: z.string(),
  suggestedValue: z.string(),
  suggestedBalance: z.string(),
  timeout: z.int().nullable(),
});

export type TsaVulnerabilityConfig = z.infer<typeof TsaVulnerabilityConfigSchema>;