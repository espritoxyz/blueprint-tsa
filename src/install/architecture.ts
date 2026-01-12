type AdoptiumOS = "mac" | "linux" | "windows";
type AdoptiumArch = "aarch64" | "x64";

/**
 * Converts Node.js OS/arch to Adoptium naming.
 * @param osName - The operating system name (from process.platform)
 * @param arch - The architecture (from process.arch)
 * @returns A tuple of [AdoptiumOS, AdoptiumArch]
 * @throws Error if OS or architecture is unsupported
 */
function mapPlatformToAdoptium(
  osName: string,
  arch: string
): [AdoptiumOS, AdoptiumArch] {
  let adoptiumOS: AdoptiumOS;
  switch (osName) {
  case "darwin":
    adoptiumOS = "mac";
    break;
  case "linux":
    adoptiumOS = "linux";
    break;
  case "win32":
    adoptiumOS = "windows";
    break;
  default:
    throw new Error(
      `unsupported OS for java runtime bootstrap: ${osName}`
    );
  }

  let adoptiumArch: AdoptiumArch;
  switch (arch) {
  case "arm64":
    adoptiumArch = "aarch64";
    break;
  case "x64":
    adoptiumArch = "x64";
    break;
  default:
    throw new Error(
      `unsupported arch for java runtime bootstrap: ${arch}`
    );
  }

  return [adoptiumOS, adoptiumArch];
}

export const [adoptiumOS, adoptiumArch] = mapPlatformToAdoptium(
  process.platform,
  process.arch
);
