/**
 * SMTP OAuth Service
 *
 * Handles OAuth2 authentication for Google Workspace and Microsoft 365
 * for SMTP-based transactional email sending.
 *
 * Features:
 * - Google OAuth2 flow (Gmail SMTP)
 * - Microsoft OAuth2 flow (Outlook/Exchange SMTP)
 * - Secure token encryption/decryption
 * - Automatic token refresh
 * - Connection verification
 */

import CryptoJS from "crypto-js";
import nodemailer from "nodemailer";
import type { SmtpProvider, InsertSmtpProvider } from "@shared/schema";
import { db } from "../db";
import { smtpProviders } from "@shared/schema";
import { eq } from "drizzle-orm";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-production";

// Google OAuth2 Configuration
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.send",
];

// Microsoft OAuth2 Configuration
const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_SCOPES = [
  "offline_access",
  "https://outlook.office.com/SMTP.Send",
];

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

export interface SmtpConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
}

export class SmtpOAuthService {
  // ==================== TOKEN ENCRYPTION ====================

  /**
   * Encrypt a token for secure storage
   */
  encryptToken(token: string): string {
    return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
  }

  /**
   * Decrypt a stored token
   */
  decryptToken(encryptedToken: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // ==================== GOOGLE OAUTH2 ====================

  /**
   * Generate Google OAuth2 authorization URL
   */
  getGoogleAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent", // Force consent to get refresh token
      ...(state && { state }),
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange Google authorization code for tokens
   */
  async exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh Google access token
   */
  async refreshGoogleToken(encryptedRefreshToken: string): Promise<OAuthTokens> {
    const refreshToken = this.decryptToken(encryptedRefreshToken);

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // May not return new refresh token
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Get Google user info to verify email address
   */
  async getGoogleUserEmail(accessToken: string): Promise<string> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to get Google user info");
    }

    const data = await response.json();
    return data.email;
  }

  // ==================== MICROSOFT OAUTH2 ====================

  /**
   * Generate Microsoft OAuth2 authorization URL
   */
  getMicrosoftAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: MICROSOFT_SCOPES.join(" "),
      response_mode: "query",
      ...(state && { state }),
    });

    return `${MICROSOFT_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange Microsoft authorization code for tokens
   */
  async exchangeMicrosoftCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    });

    const response = await fetch(MICROSOFT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh Microsoft access token
   */
  async refreshMicrosoftToken(encryptedRefreshToken: string): Promise<OAuthTokens> {
    const refreshToken = this.decryptToken(encryptedRefreshToken);

    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    });

    const response = await fetch(MICROSOFT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Get Microsoft user email from Graph API
   */
  async getMicrosoftUserEmail(accessToken: string): Promise<string> {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to get Microsoft user info");
    }

    const data = await response.json();
    return data.mail || data.userPrincipalName;
  }

  // ==================== SMTP PROVIDER MANAGEMENT ====================

  /**
   * Get a valid access token for an SMTP provider, refreshing if necessary
   */
  async getValidAccessToken(provider: SmtpProvider): Promise<string> {
    if (!provider.accessTokenEncrypted) {
      throw new Error("No access token available for this provider");
    }

    const tokenExpiresAt = provider.tokenExpiresAt ? new Date(provider.tokenExpiresAt) : new Date(0);
    const now = new Date();

    // Refresh if token expires within 5 minutes
    const bufferTime = 5 * 60 * 1000;
    if (tokenExpiresAt.getTime() - now.getTime() <= bufferTime) {
      return await this.refreshProviderToken(provider);
    }

    return this.decryptToken(provider.accessTokenEncrypted);
  }

  /**
   * Refresh the access token for an SMTP provider
   */
  async refreshProviderToken(provider: SmtpProvider): Promise<string> {
    if (!provider.refreshTokenEncrypted) {
      throw new Error("No refresh token available");
    }

    let tokens: OAuthTokens;

    if (provider.providerType === "gmail") {
      tokens = await this.refreshGoogleToken(provider.refreshTokenEncrypted);
    } else if (provider.providerType === "outlook") {
      tokens = await this.refreshMicrosoftToken(provider.refreshTokenEncrypted);
    } else {
      throw new Error(`Token refresh not supported for provider type: ${provider.providerType}`);
    }

    // Update provider with new tokens
    await db
      .update(smtpProviders)
      .set({
        accessTokenEncrypted: this.encryptToken(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken !== this.decryptToken(provider.refreshTokenEncrypted)
          ? this.encryptToken(tokens.refreshToken)
          : provider.refreshTokenEncrypted,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        tokenScopes: tokens.scope ? tokens.scope.split(" ") : provider.tokenScopes,
        updatedAt: new Date(),
      })
      .where(eq(smtpProviders.id, provider.id));

    return tokens.accessToken;
  }

  /**
   * Create a Nodemailer transporter for an SMTP provider
   */
  async createTransporter(provider: SmtpProvider): Promise<nodemailer.Transporter> {
    if (provider.providerType === "gmail" && provider.authType === "oauth2") {
      const accessToken = await this.getValidAccessToken(provider);

      return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          type: "OAuth2",
          user: provider.emailAddress,
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          refreshToken: this.decryptToken(provider.refreshTokenEncrypted!),
          accessToken,
        },
      });
    } else if (provider.providerType === "outlook" && provider.authType === "oauth2") {
      const accessToken = await this.getValidAccessToken(provider);

      return nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          type: "OAuth2",
          user: provider.emailAddress,
          clientId: process.env.MICROSOFT_CLIENT_ID!,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
          refreshToken: this.decryptToken(provider.refreshTokenEncrypted!),
          accessToken,
        },
      });
    } else if (provider.providerType === "gmail" && provider.authType === "app_password") {
      // Gmail with App Password (no OAuth needed)
      const password = provider.smtpPasswordEncrypted
        ? this.decryptToken(provider.smtpPasswordEncrypted)
        : undefined;

      return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: provider.emailAddress,
          pass: password,
        },
      });
    } else if (provider.providerType === "custom") {
      // Custom SMTP with basic auth
      const password = provider.smtpPasswordEncrypted
        ? this.decryptToken(provider.smtpPasswordEncrypted)
        : undefined;

      return nodemailer.createTransport({
        host: provider.smtpHost!,
        port: provider.smtpPort!,
        secure: provider.smtpSecure ?? true,
        auth: {
          user: provider.smtpUsername!,
          pass: password,
        },
      });
    }

    throw new Error(`Unsupported provider configuration: ${provider.providerType}/${provider.authType}`);
  }

  /**
   * Create a Nodemailer transporter from environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
   * Used as a fallback when no database-configured SMTP provider exists.
   */
  createEnvTransporter(): nodemailer.Transporter | null {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return null;
    }

    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  /**
   * Test SMTP connection for a provider
   */
  async testConnection(provider: SmtpProvider): Promise<SmtpConnectionTestResult> {
    try {
      const transporter = await this.createTransporter(provider);
      await transporter.verify();

      // Update verification status
      await db
        .update(smtpProviders)
        .set({
          verificationStatus: "verified",
          lastVerifiedAt: new Date(),
          lastVerificationError: null,
          updatedAt: new Date(),
        })
        .where(eq(smtpProviders.id, provider.id));

      return {
        success: true,
        message: "SMTP connection verified successfully",
      };
    } catch (error: any) {
      // Update verification status with error
      await db
        .update(smtpProviders)
        .set({
          verificationStatus: "failed",
          lastVerificationError: error.message,
          updatedAt: new Date(),
        })
        .where(eq(smtpProviders.id, provider.id));

      return {
        success: false,
        message: "SMTP connection failed",
        error: error.message,
      };
    }
  }

  /**
   * Send a test email using an SMTP provider
   */
  async sendTestEmail(
    provider: SmtpProvider,
    toEmail: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const transporter = await this.createTransporter(provider);

      const info = await transporter.sendMail({
        from: `${provider.displayName || "DemandGentic"} <${provider.emailAddress}>`,
        to: toEmail,
        subject: "SMTP Provider Test - DemandGentic",
        text: "This is a test email to verify your SMTP provider configuration.",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">SMTP Provider Test</h2>
            <p>This is a test email to verify your SMTP provider configuration.</p>
            <p>If you received this email, your SMTP provider is configured correctly!</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              Sent via DemandGentic Email Infrastructure
            </p>
          </div>
        `,
      });

      // Update last used timestamp
      await db
        .update(smtpProviders)
        .set({
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(smtpProviders.id, provider.id));

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update rate limit counters for a provider
   */
  async updateRateLimits(providerId: string): Promise<void> {
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [provider] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.id, providerId));

    if (!provider) return;

    // Reset hourly counter if hour changed
    const resetHourly = !provider.sentHourResetAt || new Date(provider.sentHourResetAt) < hourStart;
    // Reset daily counter if day changed
    const resetDaily = !provider.sentTodayResetAt || new Date(provider.sentTodayResetAt) < dayStart;

    await db
      .update(smtpProviders)
      .set({
        sentThisHour: resetHourly ? 1 : (provider.sentThisHour || 0) + 1,
        sentToday: resetDaily ? 1 : (provider.sentToday || 0) + 1,
        sentHourResetAt: resetHourly ? hourStart : provider.sentHourResetAt,
        sentTodayResetAt: resetDaily ? dayStart : provider.sentTodayResetAt,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(smtpProviders.id, providerId));
  }

  /**
   * Check if a provider is within rate limits
   */
  async checkRateLimits(provider: SmtpProvider): Promise<{ allowed: boolean; reason?: string }> {
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check hourly limit
    if (provider.hourlySendLimit) {
      const hourReset = provider.sentHourResetAt ? new Date(provider.sentHourResetAt) : null;
      const currentHourCount = hourReset && hourReset >= hourStart ? (provider.sentThisHour || 0) : 0;

      if (currentHourCount >= provider.hourlySendLimit) {
        return {
          allowed: false,
          reason: `Hourly limit reached (${provider.hourlySendLimit} emails/hour)`,
        };
      }
    }

    // Check daily limit
    if (provider.dailySendLimit) {
      const dayReset = provider.sentTodayResetAt ? new Date(provider.sentTodayResetAt) : null;
      const currentDayCount = dayReset && dayReset >= dayStart ? (provider.sentToday || 0) : 0;

      if (currentDayCount >= provider.dailySendLimit) {
        return {
          allowed: false,
          reason: `Daily limit reached (${provider.dailySendLimit} emails/day)`,
        };
      }
    }

    return { allowed: true };
  }
}

// Export singleton instance
export const smtpOAuthService = new SmtpOAuthService();
