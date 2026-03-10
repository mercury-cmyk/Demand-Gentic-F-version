import crypto from "node:crypto";
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { decryptJson, encryptJson } from "./lib/encryption";

export interface TotpSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BACKUP_CODE_LENGTH = 8;
const MFA_ENCRYPTION_SECRET =
  process.env.MFA_ENCRYPTION_KEY ??
  process.env.SECRET_MANAGER_MASTER_KEY ??
  process.env.SESSION_SECRET ??
  process.env.JWT_SECRET ??
  "development-mfa-secret-key-change-in-production";

function generateBackupCode(): string {
  return Array.from({ length: BACKUP_CODE_LENGTH }, () => {
    const index = crypto.randomInt(0, BACKUP_CODE_ALPHABET.length);
    return BACKUP_CODE_ALPHABET[index];
  }).join("");
}

export function encryptTotpSecret(secret: string): string {
  return encryptJson(secret, MFA_ENCRYPTION_SECRET);
}

export function decryptTotpSecret(payload: string): string {
  try {
    return decryptJson<string>(payload, MFA_ENCRYPTION_SECRET);
  } catch {
    // Support legacy/plaintext secrets if any exist from partial deployments.
    return payload;
  }
}

/**
 * Generate TOTP secret and QR code for user enrollment
 */
export async function generateTotpSecret(
  username: string,
  issuer: string = 'Pivotal B2B'
): Promise<TotpSecret> {
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${username})`,
    issuer: issuer,
    length: 32,
  });

  if (!secret.otpauth_url) {
    throw new Error('Failed to generate TOTP secret');
  }

  // Generate QR code as data URL
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  // Generate backup codes (8 codes, 8 characters each)
  const backupCodes = generateBackupCodes();

  return {
    secret: secret.base32,
    qrCode,
    backupCodes,
  };
}

/**
 * Verify TOTP token
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  const normalizedToken = token.replace(/\s+/g, "").trim();
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: normalizedToken,
    window: 2, // Allow 2 time steps before and after (60 seconds total)
  });
}

/**
 * Verify backup code
 */
export function verifyBackupCode(usedCodes: string[], backupCodes: string[], providedCode: string): boolean {
  const normalizedCode = providedCode.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  
  // Check if code exists in backup codes and hasn't been used
  return backupCodes.includes(normalizedCode) && !usedCodes.includes(normalizedCode);
}

/**
 * Generate new backup codes
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateBackupCode());
  }
  return Array.from(codes);
}
