import speakeasy from "speakeasy";
import { describe, expect, it } from "vitest";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  verifyBackupCode,
  verifyTotpToken,
} from "../totp-mfa";

describe("totp-mfa", () => {
  it("round-trips encrypted TOTP secrets", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);

    expect(encrypted).not.toBe(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it("accepts plaintext secrets for backward compatibility", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(decryptTotpSecret(secret)).toBe(secret);
  });

  it("generates a valid QR setup and verifies the current TOTP code", async () => {
    const setup = await generateTotpSecret("tester@example.com");
    const currentToken = speakeasy.totp({
      secret: setup.secret,
      encoding: "base32",
    });

    expect(setup.qrCode.startsWith("data:image/png;base64,")).toBe(true);
    expect(setup.backupCodes).toHaveLength(8);
    expect(verifyTotpToken(setup.secret, currentToken)).toBe(true);
  });

  it("only accepts unused backup codes", () => {
    const backupCodes = generateBackupCodes(4);
    const code = backupCodes[0];

    expect(verifyBackupCode([], backupCodes, code.toLowerCase())).toBe(true);
    expect(verifyBackupCode([code], backupCodes, code)).toBe(false);
    expect(verifyBackupCode([], backupCodes, "NOTREAL99")).toBe(false);
  });
});
