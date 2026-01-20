export class Sym {
  public static OK = "✅";
  public static WARN = "⚠️";
  public static ERR = "❌";
  public static WAIT = "⏳";
}

export const TSA_VERSION = "debug-2";
export const TSA_NAME = `tsa-cli-${TSA_VERSION}.jar`;
export const TSA_URL = `https://github.com/tochilinak/tsa/releases/download/${TSA_VERSION}/tsa-cli.jar`;

export const DRAIN_CHECK_SYMBOLIC_FILENAME = "drain-check-symbolic.fc";
export const DRAIN_CHECK_CONCRETE_FILENAME = "drain-check-concrete.fc";
export const DRAIN_CHECK_ID = "drain-check";

export const EXPECTED_MESSAGE_IN_SARIF =
  "TvmFailure(exit=TVM user defined error with exit code 1000, phase=TvmComputePhase)";