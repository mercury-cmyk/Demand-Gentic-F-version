/**
 * Setup Argyle Billing & Pricing Configuration
 *
 * Configures Argyle's custom pricing, billing terms, and enabled campaign types.
 *
 * Pricing:
 *   - Event Registration (Ungated/Click): $10/lead
 *   - Event Registration (Gated): $30/lead
 *   - In-Person Events Program: $80/registration
 *   - Appointment Generation: $500/booked meeting
 *
 * Billing Terms:
 *   - Monthly billing based on previous month's activity
 *   - Invoices generated on the 1st of each month
 *   - Payment due by the 10th of each month
 *   - Currency: USD
 *
 * Run: npx tsx scripts/setup-argyle-billing.ts
 */

import { db } from "../server/db";
import {
  clientAccounts,
  clientBillingConfig,
  clientCampaignPricing,
  clientPricingDocuments,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { uploadToS3 } from "../server/lib/storage";

const ARGYLE_CLIENT_ID = "073ac22d-8c16-4db5-bf4f-667021dc0717";

// Argyle's custom campaign pricing
const ARGYLE_PRICING = [
  {
    campaignType: "event_registration_digital_ungated",
    pricePerLead: "10.00",
    minimumOrderSize: 25,
    isEnabled: true,
    notes: "Argyle custom pricing - Ungated (Click) event registrations, no form required",
  },
  {
    campaignType: "event_registration_digital_gated",
    pricePerLead: "30.00",
    minimumOrderSize: 25,
    isEnabled: true,
    notes: "Argyle custom pricing - Gated event registrations, form-based registration required",
  },
  {
    campaignType: "in_person_event",
    pricePerLead: "80.00",
    minimumOrderSize: 10,
    isEnabled: true,
    notes: "Argyle custom pricing - Executive dinners, conferences, roundtables, and in-person formats",
  },
  {
    campaignType: "appointment_generation",
    pricePerLead: "500.00",
    minimumOrderSize: 5,
    isEnabled: true,
    notes: "Argyle custom pricing - Booked meetings with Argyle's target audience, confirmed appointments",
  },
];

// Campaign types to explicitly disable for Argyle (not part of their agreement)
const DISABLED_TYPES = [
  "high_quality_leads",
  "bant_leads",
  "sql",
  "lead_qualification",
  "content_syndication",
  "webinar_invite",
  "live_webinar",
  "on_demand_webinar",
  "executive_dinner",
  "leadership_forum",
  "conference",
  "email",
  "data_validation",
];

async function setupArgyleBilling() {
  console.log("=== Setting up Argyle Billing & Pricing ===\n");

  // 1. Verify Argyle client exists
  const [argyleClient] = await db
    .select({ id: clientAccounts.id, name: clientAccounts.name })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, ARGYLE_CLIENT_ID))
    .limit(1);

  if (!argyleClient) {
    console.error(`ERROR: Argyle client account not found (ID: ${ARGYLE_CLIENT_ID})`);
    process.exit(1);
  }

  console.log(`Found Argyle client: "${argyleClient.name}" (${argyleClient.id})\n`);

  // 2. Set up billing config
  console.log("--- Billing Configuration ---");
  const [existingConfig] = await db
    .select({ id: clientBillingConfig.id })
    .from(clientBillingConfig)
    .where(eq(clientBillingConfig.clientAccountId, ARGYLE_CLIENT_ID))
    .limit(1);

  const billingData = {
    defaultBillingModel: "cpl" as const,
    paymentTermsDays: 10,
    currency: "USD",
    autoInvoiceEnabled: true,
    invoiceDayOfMonth: 1,          // Invoice generated on 1st
    paymentDueDayOfMonth: 10,      // Payment due by 10th
    updatedAt: new Date(),
  };

  if (existingConfig) {
    await db
      .update(clientBillingConfig)
      .set(billingData)
      .where(eq(clientBillingConfig.clientAccountId, ARGYLE_CLIENT_ID));
    console.log("  Updated existing billing config");
  } else {
    await db.insert(clientBillingConfig).values({
      clientAccountId: ARGYLE_CLIENT_ID,
      ...billingData,
    });
    console.log("  Created new billing config");
  }

  console.log("  Billing Model: Cost Per Lead (CPL)");
  console.log("  Invoice Day: 1st of each month");
  console.log("  Payment Due: 10th of each month");
  console.log("  Currency: USD\n");

  // 3. Set up campaign pricing - enabled types
  console.log("--- Campaign Pricing (Enabled) ---");
  for (const pricing of ARGYLE_PRICING) {
    const [existing] = await db
      .select({ id: clientCampaignPricing.id })
      .from(clientCampaignPricing)
      .where(
        and(
          eq(clientCampaignPricing.clientAccountId, ARGYLE_CLIENT_ID),
          eq(clientCampaignPricing.campaignType, pricing.campaignType)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(clientCampaignPricing)
        .set({
          pricePerLead: pricing.pricePerLead,
          minimumOrderSize: pricing.minimumOrderSize,
          isEnabled: pricing.isEnabled,
          notes: pricing.notes,
          updatedAt: new Date(),
        })
        .where(eq(clientCampaignPricing.id, existing.id));
      console.log(`  Updated: ${pricing.campaignType} → $${pricing.pricePerLead}/lead`);
    } else {
      await db.insert(clientCampaignPricing).values({
        clientAccountId: ARGYLE_CLIENT_ID,
        campaignType: pricing.campaignType,
        pricePerLead: pricing.pricePerLead,
        minimumOrderSize: pricing.minimumOrderSize,
        isEnabled: pricing.isEnabled,
        notes: pricing.notes,
      });
      console.log(`  Created: ${pricing.campaignType} → $${pricing.pricePerLead}/lead`);
    }
  }

  // 4. Disable non-applicable campaign types
  console.log("\n--- Campaign Types (Disabled for Argyle) ---");
  for (const campaignType of DISABLED_TYPES) {
    const [existing] = await db
      .select({ id: clientCampaignPricing.id })
      .from(clientCampaignPricing)
      .where(
        and(
          eq(clientCampaignPricing.clientAccountId, ARGYLE_CLIENT_ID),
          eq(clientCampaignPricing.campaignType, campaignType)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(clientCampaignPricing)
        .set({
          isEnabled: false,
          notes: "Not part of Argyle agreement",
          updatedAt: new Date(),
        })
        .where(eq(clientCampaignPricing.id, existing.id));
    } else {
      await db.insert(clientCampaignPricing).values({
        clientAccountId: ARGYLE_CLIENT_ID,
        campaignType,
        pricePerLead: "0",
        minimumOrderSize: 0,
        isEnabled: false,
        notes: "Not part of Argyle agreement",
      });
    }
    console.log(`  Disabled: ${campaignType}`);
  }

  // 5. Create pricing summary document
  console.log("\n--- Pricing Document ---");

  // Check if pricing doc already exists
  const existingDocs = await db
    .select({ id: clientPricingDocuments.id })
    .from(clientPricingDocuments)
    .where(
      and(
        eq(clientPricingDocuments.clientAccountId, ARGYLE_CLIENT_ID),
        eq(clientPricingDocuments.name, "Argyle Custom Pricing - 2026")
      )
    );

  if (existingDocs.length === 0) {
    // Create a text-based pricing summary and upload to GCS
    const pricingSummary = `
ARGYLE EXECUTIVE FORUM - CUSTOM PRICING AGREEMENT
===================================================

Effective Date: February 2026
Client: Argyle Executive Forum, LLC
Account ID: ${ARGYLE_CLIENT_ID}

LEAD GENERATION & EVENT PRICING
--------------------------------

1. Event Registration - Digital (Ungated/Click)
   - No form required
   - Rate: $10.00 per lead

2. Event Registration - Digital (Gated)
   - Form-based registration required
   - Rate: $30.00 per lead

3. In-Person Events Program
   - Applicable to: Executive dinners, conferences, roundtables, and other in-person formats
   - Rate: $80.00 per registration

4. Appointment Generation
   - Meetings scheduled with Argyle's target audience
   - Delivered as confirmed appointments
   - Rate: $500.00 per booked meeting

BILLING TERMS
-------------
- Billing Cycle: Monthly (based on previous month's activity)
- Invoice Generated: 1st of each month
- Payment Due: By the 10th of each month
- Currency: USD

NOTES
-----
This pricing structure applies exclusively to Argyle's event-driven lead generation
and attendee acquisition programs. All services are managed through the DemandGentic
Client Portal with full transparency into activity, costs, and invoicing.

---
Generated by DemandGentic AI Platform
`.trim();

    const fileKey = `pricing-documents/${Date.now()}-argyle-custom-pricing-2026.txt`;

    try {
      await uploadToS3(fileKey, Buffer.from(pricingSummary, "utf-8"), "text/plain");
      console.log(`  Uploaded pricing document to GCS: ${fileKey}`);
    } catch (err) {
      console.warn(`  Warning: Could not upload to GCS (may not be configured locally): ${err}`);
      console.log("  Pricing document record will be created with reference key for production use");
    }

    await db.insert(clientPricingDocuments).values({
      clientAccountId: ARGYLE_CLIENT_ID,
      name: "Argyle Custom Pricing - 2026",
      description: "Custom pricing agreement for Argyle's event-driven lead generation and attendee acquisition programs",
      fileKey,
      fileName: "argyle-custom-pricing-2026.txt",
      fileType: "text/plain",
      fileSize: Buffer.byteLength(pricingSummary, "utf-8"),
      uploadedBy: "System (setup script)",
    });
    console.log("  Created pricing document record in database");
  } else {
    console.log("  Pricing document already exists, skipping");
  }

  console.log("\n=== Argyle Billing Setup Complete ===");
  console.log("\nSummary:");
  console.log("  Enabled services:");
  console.log("    - Event Registration (Ungated/Click): $10/lead");
  console.log("    - Event Registration (Gated): $30/lead");
  console.log("    - In-Person Events Program: $80/registration");
  console.log("    - Appointment Generation: $500/booked meeting");
  console.log("  Billing: Monthly, invoiced on 1st, payment due by 10th");
  console.log("  Disabled: 13 other campaign types");
  console.log("  Pricing document: Argyle Custom Pricing - 2026");
  console.log("\nArgyle can view this pricing at: Client Portal → Billing → Pricing & Terms");
  console.log("Admin can manage at: Client Management → Argyle → Pricing tab");
}

setupArgyleBilling()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
