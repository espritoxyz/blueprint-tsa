import * as z from "zod";

const DrainOptionsSchema = z.object({ kind: z.literal("drain-check") });
const OwnerHijackOptionsSchema = z.object({
  kind: z.literal("owner-hijack-check"),
  /**
   * for serialization purposes: bigints are not serializable
   */
  methodId: z.string(),
});
export type OwnerHijackOptions = z.infer<typeof OwnerHijackOptionsSchema>;

export const ConcreteCheckerOptionsSchema = z.xor([
  DrainOptionsSchema,
  OwnerHijackOptionsSchema,
]);

export type ConcreteCheckerOptions = z.infer<
  typeof ConcreteCheckerOptionsSchema
>;

export const TsaVulnerabilityConfigSchema = z.object({
  mode: z.string(),
  command: z.string(),
  codePath: z.string(),
  dataPath: z.string(),
  suggestedValue: z.string(),
  suggestedBalance: z.string(),
  timeout: z.int().nullable(),
  concreteCheckerOptions: ConcreteCheckerOptionsSchema,
});

export type TsaVulnerabilityConfig = z.infer<
  typeof TsaVulnerabilityConfigSchema
>;
