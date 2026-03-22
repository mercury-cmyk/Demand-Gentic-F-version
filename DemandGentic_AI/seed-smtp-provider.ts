/**
 * Gmail SMTP setup for mercury@pivotal-b2b.com
 *
 * Usage:
 *   Step 1: npx tsx seed-smtp-provider.ts
 *           → Opens Google OAuth URL. Sign in and authorize.
 *           → Google redirects to a URL — copy the "code" parameter from it.
 *
 *   Step 2: npx tsx seed-smtp-provider.ts --code=PASTE_CODE_HERE
 *           → Exchanges the code for tokens and saves them to the database.
 */
import { config } from "dotenv";
config({ path: ".env" });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import CryptoJS from "crypto-js";
import { smtpProviders } from "./shared/schema";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-production";
const PROVIDER_EMAIL = "mercury@pivotal-b2b.com";

// Use a localhost redirect URI — we'll just read the code from the URL bar
const REDIRECT_URI = "https://demandgentic.ai/api/smtp-providers/oauth/google/callback";

function encryptToken(token: string): string {
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
}

function generateGoogleOAuthUrl(providerId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://mail.google.com/ https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state: Buffer.from(JSON.stringify({ providerId })).toString("base64"),
    login_hint: PROVIDER_EMAIL,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code: string): Promise {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Token exchange failed: ${data.error} - ${data.error_description}`);
  }
  return data;
}

async function getGoogleUserEmail(accessToken: string): Promise {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  return data.email;
}

async function ensureProvider(): Promise {
  const [existing] = await db
    .select()
    .from(smtpProviders)
    .where(eq(smtpProviders.emailAddress, PROVIDER_EMAIL))
    .limit(1);

  if (existing) {
    console.log(`Provider exists: ${existing.id} (status: ${existing.verificationStatus})`);
    return existing.id;
  }

  // Unset existing defaults
  await db
    .update(smtpProviders)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(smtpProviders.isDefault, true));

  const [provider] = await db
    .insert(smtpProviders)
    .values({
      name: "Mercury - Pivotal B2B",
      providerType: "gmail",
      authType: "oauth2",
      emailAddress: PROVIDER_EMAIL,
      displayName: "Pivotal B2B",
      dailySendLimit: 2000,
      hourlySendLimit: 25,
      isDefault: true,
      isActive: true,
      verificationStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  console.log(`Provider created: ${provider.id}`);
  return provider.id;
}

async function main() {
  // Check for --code argument
  const codeArg = process.argv.find(a => a.startsWith("--code="));
  const code = codeArg?.split("=").slice(1).join("="); // Handle = in the code itself

  const providerId = await ensureProvider();

  if (!code) {
    // Step 1: Generate OAuth URL
    const authUrl = generateGoogleOAuthUrl(providerId);
    console.log("\n====================================================");
    console.log("STEP 1: Open this URL in your browser:");
    console.log("====================================================\n");
    console.log(authUrl);
    console.log("\n====================================================");
    console.log("Sign in as mercury@pivotal-b2b.com and grant access.");
    console.log("");
    console.log("After authorizing, Google will redirect to a URL.");
    console.log("It may show an error page — THAT'S OK.");
    console.log("Copy the 'code' parameter from the URL bar.");
    console.log("");
    console.log("The URL will look like:");
    console.log("  https://demandgentic.ai/...?code=4/0AXXXXXX...&scope=...");
    console.log("");
    console.log("STEP 2: Run this command with the code:");
    console.log(`  npx tsx seed-smtp-provider.ts --code=PASTE_THE_CODE_HERE`);
    console.log("====================================================\n");
  } else {
    // Step 2: Exchange code for tokens
    console.log("\nExchanging authorization code for tokens...");
    const tokens = await exchangeCode(code);
    console.log("Token exchange successful!");

    const userEmail = await getGoogleUserEmail(tokens.access_token);
    console.log(`Authenticated as: ${userEmail}`);

    // Save tokens to database
    await db
      .update(smtpProviders)
      .set({
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        tokenScopes: (tokens.scope || "").split(" "),
        emailAddress: userEmail,
        verificationStatus: "verified",
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(smtpProviders.id, providerId));

    console.log("\n====================================================");
    console.log("SUCCESS! Gmail SMTP provider is connected.");
    console.log(`  Provider ID: ${providerId}`);
    console.log(`  Email: ${userEmail}`);
    console.log(`  Status: verified`);
    console.log(`  Default: true`);
    console.log("====================================================\n");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  pool.end();
  process.exit(1);
});