export class Sym {
  public static OK = "✅";
  public static WARN = "⚠️";
  public static ERR = "❌";
  public static WAIT = "⏳";
}

export const TSA_VERSION = "v0.5.3";
export const TSA_NAME = `tsa-cli-${TSA_VERSION}.jar`;
export const TSA_URL = `https://github.com/espritoxyz/tsa/releases/download/${TSA_VERSION}/tsa-cli.jar`;

export const DRAIN_CHECK_SYMBOLIC_FILENAME = "drain-check-symbolic.fc";
export const DRAIN_CHECK_CONCRETE_FILENAME = "drain-check-concrete.fc";
export const DRAIN_CHECK_ID = "drain-check";
export const DRAIN_DESCRIPTION_URL =
  "https://tonsec.dev/docs/builtin-checkers#drain-check";

export const REPRODUCE_ID = "reproduce";

export const REPLAY_ATTACK_CHECK_SYMBOLIC_FILENAME =
  "replay-attack-symbolic.fc";
export const REPLAY_ATTACK_CHECK_ID = "replay-attack-check";
export const REPLAY_DESCRIPTION_URL =
  "https://tonsec.dev/docs/builtin-checkers#replay-attack-checker";

export const BOUNCE_CHECK_FILENAME = "bounce-check.fc";
export const BOUNCE_CHECK_SCHEME_FILENAME = "bounce-check-scheme.json";
export const BOUNCE_CHECK_ID = "bounce-check";
export const BOUNCE_DESCRIPTION_URL =
  "https://tonsec.dev/docs/builtin-checkers#bounced-messages-processing-checker";

export const THROWER_FILENAME = "thrower-contract.fc";

export const OWNER_HIJACK_CHECK_ID = "owner-hijack-check";
export const OWNER_HIJACK_CHECK_SYMBOLIC_FILENAME = "owner-hijack-symbolic.fc";
export const OWNER_HIJACK_CHECK_CONCRETE_FILENAME = "owner-hijack-concrete.fc";
export const OWNER_HIJACK_DESCRIPTION_URL =
  "https://tonsec.dev/docs/builtin-checkers#ownership-hijack-check";

export const OPCODE_INFO = "opcode-info";
export const OPCODE_AUTHORIZATION_CHECK_FILENAME = "authorization-check.fc";
export const OPCODE_INFO_DESCRIPTION_URL =
  "https://tonsec.dev/docs/builtin-checkers#opcode-authorization-check";

export const AUDIT_ID = "audit";

export const DRAIN_CHECK_NAME = "Drain Check";
export const REPLAY_ATTACK_CHECK_NAME = "Replay Attack Check";
export const OWNER_HIJACK_CHECK_NAME = "Owner Hijack Check";
export const BOUNCE_CHECK_NAME = "Bounce Check";

export const ERROR_EXIT_CODE = 1000;
export const NON_FAILING_EXIT_CODE = 1001;
export const EXPECTED_MESSAGE_IN_SARIF = `TvmFailure(exit=TVM user defined error with exit code ${ERROR_EXIT_CODE}, phase=TvmComputePhase)`;
export const EXPECTED_MESSAGE_NON_FAILING = `TvmFailure(exit=TVM user defined error with exit code ${NON_FAILING_EXIT_CODE}, phase=TvmComputePhase)`;

export const ANALYSIS_INFO_TITLE = "TSA analysis";

export const DEPLOY_AND_REPRODUCE_COMMAND = "deploy-and-reproduce";

export const DEPLOY_WAIT_ATTEMPTS = 30;

export const DEFAULT_ITERATION_LIMIT = 2;
export const DEFAULT_RECURSION_LIMIT = 1;
