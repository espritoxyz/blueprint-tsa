/**
 * Formats an opcode as an 8-digit hexadecimal string with 0x prefix
 * @param opcode - The opcode number to format
 * @returns Formatted opcode string (e.g., "0x00000001")
 */
export function formatOpcodeHex(opcode: number): string {
  return `0x${opcode.toString(16).padStart(8, "0")}`;
}
