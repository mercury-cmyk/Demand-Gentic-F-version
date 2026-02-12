import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface TotpSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
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
  const backupCodes = Array.from({ length: 8 }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );

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
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps before and after (60 seconds total)
  });
}

/**
 * Verify backup code
 */
export function verifyBackupCode(usedCodes: string[], backupCodes: string[], providedCode: string): boolean {
  const normalizedCode = providedCode.toUpperCase().trim();
  
  // Check if code exists in backup codes and hasn't been used
  return backupCodes.includes(normalizedCode) && !usedCodes.includes(normalizedCode);
}

/**
 * Generate new backup codes
 */
export function generateBackupCodes(count: number = 8): string[] {
  return Array.from({ length: count }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );
}
