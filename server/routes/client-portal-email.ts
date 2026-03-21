/**
 * Client Portal Email Connection Routes
 *
 * Provides OAuth flows (Google, Microsoft) and custom SMTP configuration
 * for client portal users to connect their email accounts.
 *
 * Two exported routers:
 *   - default export (authRouter): requires clientAuth — status, authorize, disconnect, smtp
 *   - callbackRouter: NO auth — handles Google/Microsoft OAuth redirects
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { clientMailboxAccounts } from '@shared/schema';
import { z } from 'zod';
import { getOAuthStateStore } from '../lib/oauth-state-store';

// Auth'd routes (status, authorize, disconnect, smtp) — mounted with requireClientAuth
const router = Router();
// Callback routes (no auth — OAuth redirect landing) — mounted separately
export const callbackRouter = Router();

// ==================== CONSTANTS ====================
const APP_BASE_URL = process.env.APP_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:5000';

// Google OAuth
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_AUTH_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID ?? '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET ?? '').trim();
const GOOGLE_SCOPES = process.env.GOOGLE_OAUTH_SCOPES ??
  'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
// Client portal uses a separate callback path to avoid collision with admin OAuth
const GOOGLE_CLIENT_REDIRECT_URI =
  (process.env.GOOGLE_CLIENT_OAUTH_REDIRECT_URI ?? `${APP_BASE_URL.replace(/\/$/, '')}/api/client-portal/email/google/callback`).trim();

// Microsoft OAuth
const M365_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? process.env.MSFT_OAUTH_CLIENT_ID ?? process.env.M365_CLIENT_ID ?? '';
const M365_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MSFT_OAUTH_CLIENT_SECRET ?? process.env.M365_CLIENT_SECRET ?? '';
const M365_TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? process.env.MSFT_OAUTH_TENANT_ID ?? process.env.M365_TENANT_ID ?? 'common';
const M365_SCOPES = process.env.MSFT_OAUTH_SCOPES ?? 'offline_access Mail.Read Mail.ReadBasic Mail.ReadWrite Mail.Send';
const M365_CLIENT_REDIRECT_URI =
  process.env.MSFT_CLIENT_OAUTH_REDIRECT_URI ?? `${APP_BASE_URL.replace(/\/$/, '')}/api/client-portal/email/microsoft/callback`;

// Encryption
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  process.env.MAILBOX_ENCRYPTION_KEY ||
  process.env.MSFT_OAUTH_CLIENT_SECRET ||
  process.env.M365_CLIENT_SECRET ||
  '';

// ==================== HELPERS ====================

function base64URLEncode(buffer: Buffer) {
  return buffer.toString('base64url');
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(48));
}

function generateState() {
  return base64URLEncode(crypto.randomBytes(24));
}

let oauthStateStore: ReturnType<typeof getOAuthStateStore> | null = null;
try {
  oauthStateStore = getOAuthStateStore();
} catch {
  oauthStateStore = null;
}

async function exchangeGoogleCode(code: string, codeVerifier: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: GOOGLE_CLIENT_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to exchange Google authorization code');
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
    token_type: string;
  };
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to fetch Google profile');
  }

  return (await response.json()) as {
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };
}

async function exchangeMicrosoftCode(code: string, codeVerifier: string) {
  const params = new URLSearchParams({
    client_id: M365_CLIENT_ID,
    scope: M365_SCOPES,
    code,
    redirect_uri: M365_CLIENT_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  if (M365_CLIENT_SECRET) {
    params.set('client_secret', M365_CLIENT_SECRET);
  }

  const response = await fetch(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to exchange Microsoft authorization code');
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
    token_type: string;
  };
}

async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to fetch Microsoft profile');
  }

  return (await response.json()) as {
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
}

function oauthSuccessHtml(provider: string) {
  return `<!DOCTYPE html><html><head><title>OAuth Success</title></head><body>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-success', provider: '${provider}' }, '*');
        window.close();
      } else { window.location.href = '/client-portal/email-inbox?oauth=success'; }
    </script>
    <p>Authentication successful! This window should close automatically...</p>
  </body></html>`;
}

function oauthErrorHtml(provider: string, error: string) {
  return `<!DOCTYPE html><html><head><title>OAuth Failed</title></head><body>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-error', provider: '${provider}', error: ${JSON.stringify(error)} }, '*');
        window.close();
      } else { window.location.href = '/client-portal/email-inbox?error=' + encodeURIComponent(${JSON.stringify(error)}); }
    </script>
    <p>Authentication failed. This window should close automatically...</p>
  </body></html>`;
}

// ==================== STATUS ====================

/**
 * GET /status
 * Returns all connected mailboxes for the current client user.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Shared inbox: query by clientAccountId so all users on the same client see the same mailbox
    const mailboxes = await db
      .select({
        id: clientMailboxAccounts.id,
        provider: clientMailboxAccounts.provider,
        status: clientMailboxAccounts.status,
        mailboxEmail: clientMailboxAccounts.mailboxEmail,
        displayName: clientMailboxAccounts.displayName,
        connectedAt: clientMailboxAccounts.connectedAt,
        lastSyncAt: clientMailboxAccounts.lastSyncAt,
      })
      .from(clientMailboxAccounts)
      .where(eq(clientMailboxAccounts.clientAccountId, clientAccountId));

    const result: Record<string, {
      connected: boolean;
      mailboxEmail?: string | null;
      displayName?: string | null;
      connectedAt?: Date | null;
    }> = {};

    for (const mb of mailboxes) {
      if (mb.status === 'connected') {
        result[mb.provider] = {
          connected: true,
          mailboxEmail: mb.mailboxEmail,
          displayName: mb.displayName,
          connectedAt: mb.connectedAt,
        };
      }
    }

    res.json(result);
  } catch (error) {
    console.error('[ClientEmail] Status error:', error);
    res.status(500).json({ message: 'Failed to get email status' });
  }
});

// ==================== GOOGLE OAUTH ====================

/**
 * GET /google/authorize
 * Starts Google OAuth PKCE flow for client portal user.
 */
router.get('/google/authorize', async (req: Request, res: Response) => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ message: 'Google OAuth is not configured.' });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    if (!oauthStateStore) {
      return res.status(503).json({ message: 'OAuth state store not available.' });
    }

    // Store state with client user info (userId field repurposed for clientUserId)
    await oauthStateStore.set(state, {
      codeVerifier,
      userId: `client:${req.clientUser!.clientUserId}:${req.clientUser!.clientAccountId}`,
    });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', GOOGLE_CLIENT_REDIRECT_URI);
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('[ClientEmail] Google authorize error:', error);
    res.status(500).json({ message: 'Failed to initiate Google OAuth flow' });
  }
});

/**
 * GET /google/callback
 * Handles Google OAuth callback — exchanges code, stores tokens, closes popup.
 * No auth middleware — this is the OAuth redirect landing page.
 */
callbackRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
      console.error('[ClientEmail] Google OAuth error:', oauthError, error_description);
      return res.send(oauthErrorHtml('google', (error_description as string) || 'Google OAuth failed'));
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      return res.send(oauthErrorHtml('google', 'Missing authorization code or state'));
    }

    if (!oauthStateStore) {
      return res.send(oauthErrorHtml('google', 'OAuth state store unavailable'));
    }

    const pending = await oauthStateStore.get(state);
    if (!pending) {
      return res.send(oauthErrorHtml('google', 'Invalid or expired authorization request. Please try again.'));
    }

    await oauthStateStore.delete(state);

    // Parse client user info from state
    const parts = pending.userId.split(':');
    if (parts[0] !== 'client' || parts.length < 3) {
      return res.send(oauthErrorHtml('google', 'Invalid OAuth state'));
    }
    const clientUserId = parts[1];
    const clientAccountId = parts[2];

    const tokenData = await exchangeGoogleCode(code, pending.codeVerifier);
    const profile = await fetchGoogleProfile(tokenData.access_token);

    if (!ENCRYPTION_KEY) {
      return res.send(oauthErrorHtml('google', 'Encryption key not configured'));
    }

    const encryptedAccessToken = CryptoJS.AES.encrypt(tokenData.access_token, ENCRYPTION_KEY).toString();
    const encryptedRefreshToken = tokenData.refresh_token
      ? CryptoJS.AES.encrypt(tokenData.refresh_token, ENCRYPTION_KEY).toString()
      : null;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Shared inbox: upsert by clientAccountId so all users share the same Google connection
    const [existing] = await db
      .select()
      .from(clientMailboxAccounts)
      .where(and(
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, 'google'),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(clientMailboxAccounts)
        .set({
          mailboxEmail: profile.email || existing.mailboxEmail,
          displayName: profile.name || existing.displayName,
          connectedAt: new Date(),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken || existing.refreshToken,
          tokenExpiresAt: expiresAt,
          status: 'connected',
          updatedAt: new Date(),
        })
        .where(eq(clientMailboxAccounts.id, existing.id));
    } else {
      await db.insert(clientMailboxAccounts).values({
        clientAccountId,
        clientUserId,
        provider: 'google',
        mailboxEmail: profile.email || null,
        displayName: profile.name || null,
        connectedAt: new Date(),
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: expiresAt,
        status: 'connected',
      });
    }

    res.send(oauthSuccessHtml('google'));
  } catch (error) {
    console.error('[ClientEmail] Google callback error:', error);
    res.send(oauthErrorHtml('google', 'OAuth callback failed'));
  }
});

// ==================== MICROSOFT OAUTH ====================

/**
 * GET /microsoft/authorize
 * Starts Microsoft 365 OAuth PKCE flow for client portal user.
 */
router.get('/microsoft/authorize', async (req: Request, res: Response) => {
  try {
    if (!M365_CLIENT_ID) {
      return res.status(500).json({ message: 'Microsoft OAuth is not configured.' });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    if (!oauthStateStore) {
      return res.status(503).json({ message: 'OAuth state store not available.' });
    }

    await oauthStateStore.set(state, {
      codeVerifier,
      userId: `client:${req.clientUser!.clientUserId}:${req.clientUser!.clientAccountId}`,
    });

    const authUrl = new URL(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', M365_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', M365_CLIENT_REDIRECT_URI);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', M365_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('[ClientEmail] Microsoft authorize error:', error);
    res.status(500).json({ message: 'Failed to initiate Microsoft OAuth flow' });
  }
});

/**
 * GET /microsoft/callback
 * Handles Microsoft OAuth callback — no auth required (redirect landing page).
 */
callbackRouter.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
      console.error('[ClientEmail] Microsoft OAuth error:', oauthError, error_description);
      return res.send(oauthErrorHtml('microsoft', (error_description as string) || 'Microsoft OAuth failed'));
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      return res.send(oauthErrorHtml('microsoft', 'Missing authorization code or state'));
    }

    if (!oauthStateStore) {
      return res.send(oauthErrorHtml('microsoft', 'OAuth state store unavailable'));
    }

    const pending = await oauthStateStore.get(state);
    if (!pending) {
      return res.send(oauthErrorHtml('microsoft', 'Invalid or expired authorization request. Please try again.'));
    }

    await oauthStateStore.delete(state);

    const parts = pending.userId.split(':');
    if (parts[0] !== 'client' || parts.length < 3) {
      return res.send(oauthErrorHtml('microsoft', 'Invalid OAuth state'));
    }
    const clientUserId = parts[1];
    const clientAccountId = parts[2];

    const tokenData = await exchangeMicrosoftCode(code, pending.codeVerifier);
    const profile = await fetchMicrosoftProfile(tokenData.access_token);

    if (!ENCRYPTION_KEY) {
      return res.send(oauthErrorHtml('microsoft', 'Encryption key not configured'));
    }

    const encryptedAccessToken = CryptoJS.AES.encrypt(tokenData.access_token, ENCRYPTION_KEY).toString();
    const encryptedRefreshToken = CryptoJS.AES.encrypt(tokenData.refresh_token, ENCRYPTION_KEY).toString();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Shared inbox: upsert by clientAccountId so all users share the same Microsoft connection
    const [existing] = await db
      .select()
      .from(clientMailboxAccounts)
      .where(and(
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, 'o365'),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(clientMailboxAccounts)
        .set({
          mailboxEmail: profile.mail || profile.userPrincipalName || existing.mailboxEmail,
          displayName: profile.displayName || existing.displayName,
          connectedAt: new Date(),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          status: 'connected',
          updatedAt: new Date(),
        })
        .where(eq(clientMailboxAccounts.id, existing.id));
    } else {
      await db.insert(clientMailboxAccounts).values({
        clientAccountId,
        clientUserId,
        provider: 'o365',
        mailboxEmail: profile.mail || profile.userPrincipalName || null,
        displayName: profile.displayName || null,
        connectedAt: new Date(),
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: expiresAt,
        status: 'connected',
      });
    }

    res.send(oauthSuccessHtml('microsoft'));
  } catch (error) {
    console.error('[ClientEmail] Microsoft callback error:', error);
    res.send(oauthErrorHtml('microsoft', 'OAuth callback failed'));
  }
});

// ==================== SMTP CONFIGURATION ====================

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  tls: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1),
  fromEmail: z.string().email(),
  displayName: z.string().optional(),
});

/**
 * POST /smtp/configure
 * Stores SMTP credentials (encrypted) for the client user.
 */
router.post('/smtp/configure', async (req: Request, res: Response) => {
  try {
    const clientUserId = req.clientUser!.clientUserId;
    const clientAccountId = req.clientUser!.clientAccountId;

    const data = smtpConfigSchema.parse(req.body);

    if (!ENCRYPTION_KEY) {
      return res.status(500).json({ message: 'Encryption key not configured' });
    }

    const encryptedPassword = CryptoJS.AES.encrypt(data.password, ENCRYPTION_KEY).toString();

    // Shared inbox: upsert by clientAccountId so all users share the same SMTP config
    const [existing] = await db
      .select()
      .from(clientMailboxAccounts)
      .where(and(
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, 'smtp'),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(clientMailboxAccounts)
        .set({
          mailboxEmail: data.fromEmail,
          displayName: data.displayName || null,
          smtpConfig: { host: data.host, port: data.port, tls: data.tls, username: data.username },
          encryptedTokens: encryptedPassword,
          connectedAt: new Date(),
          status: 'connected',
          updatedAt: new Date(),
        })
        .where(eq(clientMailboxAccounts.id, existing.id));
    } else {
      await db.insert(clientMailboxAccounts).values({
        clientAccountId,
        clientUserId,
        provider: 'smtp',
        mailboxEmail: data.fromEmail,
        displayName: data.displayName || null,
        smtpConfig: { host: data.host, port: data.port, tls: data.tls, username: data.username },
        encryptedTokens: encryptedPassword,
        connectedAt: new Date(),
        status: 'connected',
      });
    }

    res.json({ message: 'SMTP configured successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid SMTP configuration', errors: error.errors });
    }
    console.error('[ClientEmail] SMTP configure error:', error);
    res.status(500).json({ message: 'Failed to configure SMTP' });
  }
});

// ==================== DISCONNECT ====================

/**
 * POST /disconnect/:provider
 * Disconnects (wipes tokens) a specific provider mailbox.
 */
router.post('/disconnect/:provider', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const provider = req.params.provider;

    if (!['google', 'o365', 'smtp'].includes(provider)) {
      return res.status(400).json({ message: 'Invalid provider' });
    }

    // Shared inbox: disconnect by clientAccountId
    const [mailbox] = await db
      .select()
      .from(clientMailboxAccounts)
      .where(and(
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, provider),
      ))
      .limit(1);

    if (!mailbox) {
      return res.status(404).json({ message: 'No mailbox connected for this provider' });
    }

    await db
      .update(clientMailboxAccounts)
      .set({
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        encryptedTokens: null,
        smtpConfig: null,
        updatedAt: new Date(),
      })
      .where(eq(clientMailboxAccounts.id, mailbox.id));

    res.json({ message: `${provider} mailbox disconnected successfully` });
  } catch (error) {
    console.error('[ClientEmail] Disconnect error:', error);
    res.status(500).json({ message: 'Failed to disconnect mailbox' });
  }
});

export default router;
