/**
 * One-time script: Create Gmail SMTP provider for mercury@pivotal-b2b.com
 * and generate the OAuth URL directly (no API auth needed).
 *
 * Run with: npx tsx seed-smtp-provider.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import { smtpProviders } from "./shared/schema";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function generateGoogleOAuthUrl(providerId: string): string {
  const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  const redirectUri = `${process.env.APP_BASE_URL}/api/smtp-providers/oauth/google/callback`;
  const state = Buffer.from(JSON.stringify({ providerId })).toString("base64");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://mail.google.com/ https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state,
    login_hint: "mercury@pivotal-b2b.com",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function main() {
  console.log("Setting up Gmail SMTP for mercury@pivotal-b2b.com...\n");

  // Check if already exists
  let providerId: string;

  const [existing] = await db
    .select()
    .from(smtpProviders)
    .where(eq(smtpProviders.emailAddress, "mercury@pivotal-b2b.com"))
    .limit(1);

  if (existing) {
    providerId = existing.id;
    console.log("Provider already exists:");
    console.log("  ID:", existing.id);
    console.log("  Status:", existing.verificationStatus);
  } else {
    // Unset any existing defaults
    await db
      .update(smtpProviders)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(smtpProviders.isDefault, true));

    // Create the provider
    const [provider] = await db
      .insert(smtpProviders)
      .values({
        name: "Mercury - Pivotal B2B",
        providerType: "gmail",
        authType: "oauth2",
        emailAddress: "mercury@pivotal-b2b.com",
        displayName: "Pivotal B2B",
        dailySendLimit: 2000,
        hourlySendLimit: 400,
        isDefault: true,
        isActive: true,
        verificationStatus: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    providerId = provider.id;
    console.log("Provider created!");
    console.log("  ID:", provider.id);
  }

  // Generate OAuth URL directly
  const authUrl = generateGoogleOAuthUrl(providerId);

  console.log("\n========================================");
  console.log("OPEN THIS URL IN YOUR BROWSER:");
  console.log("========================================\n");
  console.log(authUrl);
  console.log("\n========================================");
  console.log("Sign in as mercury@pivotal-b2b.com and grant access.");
  console.log("It will redirect back to demandgentic.ai and store the tokens.");
  console.log("========================================\n");

  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
