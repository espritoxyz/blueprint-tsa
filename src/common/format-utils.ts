/**
 * Formats an opcode as an 8-digit hexadecimal string with 0x prefix
 * @param opcode - The opcode number to format
 * @returns Formatted opcode string (e.g., "0x00000001")
 */
export function formatOpcodeHex(opcode: number): string {
  return `0x${opcode.toString(16).padStart(8, "0")}`;
}

/**
 * Generates a unique identifier based on current date and time
 * Format: YYYY-MM-DD-milliseconds (where milliseconds is time since start of day)
 * @returns Unique identifier string
 */
export function generateReportId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const startOfDay = new Date(year, now.getMonth(), now.getDate());
  const milliseconds = now.getTime() - startOfDay.getTime();

  return `${year}-${month}-${day}-${milliseconds}`;
}
