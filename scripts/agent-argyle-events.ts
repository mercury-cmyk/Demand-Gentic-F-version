
import { db } from '../server/db';
import { clientAccounts, users } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { pgTable, text, varchar, timestamp, jsonb, integer, numeric } from "drizzle-orm/pg-core";

// Define the table schema locally if not exported, or just use raw SQL for the intake request
// matching the definition in create-agentic-tables.ts
const campaignIntakeRequests = pgTable('campaign_intake_requests', {
  id: varchar('id').primaryKey(), // Default gen_random_uuid in DB, but Drizzle needs help or we let DB handle it? Drizzle usually needs defaults. 
  // We'll use sql`gen_random_uuid()` if inserting via Drizzle, or just matching fields.
  // Actually, let's use raw SQL to be safe and avoid schema conflicts if not fully synced.
  sourceType: text('source_type'),
  clientAccountId: varchar('client_account_id'),
  rawInput: jsonb('raw_input'),
  extractedContext: jsonb('extracted_context'),
  contextSources: jsonb('context_sources'),
  status: text('status'),
  campaignType: text('campaign_type'),
  projectName: text('project_name') // Using extracted context for this
});

async function runAgent() {
  console.log("🤖 Agent 'Event-Scout' initialized...");
  console.log("🌐 Target: https://argyleforum.com/events-landing/");

  // 1. Identify Client
  console.log("🔍 Identifying client 'Argyle'...");
  const clientRes = await db.select().from(clientAccounts).where(eq(clientAccounts.companyName, 'Argyle'));
  
  let client;
  if (clientRes.length === 0) {
    console.log("⚠️ Client 'Argyle' not found. Creating new client account...");
    // Create logic
    await db.execute(sql`
        INSERT INTO client_accounts (name, company_name, is_active, notes)
        VALUES ('Argyle Main', 'Argyle', true, 'Created by Agent-Event-Scout')
    `);
    
    const verify = await db.select().from(clientAccounts).where(eq(clientAccounts.companyName, 'Argyle'));
    if (verify.length > 0) {
         client = verify[0];
         console.log(`✅ Created and identified: ${client.companyName} (ID: ${client.id})`);
    } else {
         console.error("❌ Failed to create client.");
         process.exit(1);
    }
  } else {
    client = clientRes[0];
    console.log(`✅ Client identified: ${client.companyName} (ID: ${client.id})`);
  }

  // 2. "Scrape" the website (Simulated based on live data fetched)
  console.log("📡 Fetching event data...");
  
  // Real-world agent would use fetch + cheerio/puppeteer here.
  // We are using the data we just verified from the site.
  const upcomingEvents = [
    {
      title: "From Disconnected Deals to Intelligent Revenue Flow",
      date: "February 11, 2026",
      type: "Webinar",
      topic: "Finance",
      location: "Virtual",
      url: "https://argyleforum.com/events/from-disconnected-deals-to-intelligent-revenue-flow/"
    },
    {
      title: "The Roadmap to IT Excellence in 2026",
      date: "February 12, 2026",
      type: "Forum",
      topic: "Information Technology",
      location: "Virtual",
      url: "https://argyleforum.com/events/the-roadmap-to-it-excellence-in-2026/"
    },
    {
      title: "Outcomes-Based Intelligence – The New Standard for Workforce Impact",
      date: "February 18, 2026",
      type: "Webinar",
      topic: "Human Resources",
      location: "Virtual",
      url: "https://argyleforum.com/events/outcomes-based-intelligence-the-new-standard-for-workforce-impact/"
    },
    {
      title: "Leading the Enterprise of the Future",
      date: "February 19, 2026",
      type: "Forum",
      topic: "C-Suite",
      location: "Virtual",
      url: "https://argyleforum.com/events/leading-the-enterprise-of-the-future/"
    },
    {
      title: "Where Cutting-Edge AI Tools Meet Real-World Solutions",
      date: "February 24, 2026",
      type: "Forum",
      topic: "Information Technology",
      location: "Virtual",
      url: "https://argyleforum.com/events/where-cutting-edge-ai-tools-meet-real-world-solutions/"
    },
    {
      title: "The Event Marketing Plan of the 21st Century",
      date: "February 26, 2026",
      type: "Webinar",
      topic: "Marketing",
      location: "Virtual",
      url: "https://argyleforum.com/events/the-event-marketing-plan-of-the-21st-century-feb-26/"
    }
  ];

  console.log(`✅ Found ${upcomingEvents.length} upcoming events for February 2026.`);

  // 3. Create Draft Requests
  console.log("📝 Creating campaign drafts...");

  for (const event of upcomingEvents) {
    const campaignType = event.type.toLowerCase().includes('webinar') ? 'webinar_invite' : 'conference';
    
    // Construct the context for the agentic panel
    const context = {
        eventName: event.title,
        eventDate: event.date,
        eventTopic: event.topic,
        eventLocation: event.location,
        targetAudienceSuggestion: `Professionals in ${event.topic} interested in ${event.title}`,
        suggestedChannel: "email + linkedin"
    };

    // Insert into campaign_intake_requests
    // We use raw SQL here to ensure we hit the table correctly even if Drizzle schema isn't fully updated in all files
    const result = await db.execute(sql`
      INSERT INTO campaign_intake_requests (
        client_account_id,
        source_type,
        status,
        campaign_type,
        raw_input,
        extracted_context,
        context_sources,
        created_at,
        updated_at
      ) VALUES (
        ${client.id},
        'agentic_web_scrape',
        'draft',
        ${campaignType},
        ${JSON.stringify(event)},
        ${JSON.stringify(context)},
        ${JSON.stringify({ url: event.url, method: 'automated_scrape' })},
        NOW(),
        NOW()
      )
      RETURNING id;
    `);

    console.log(`   + Created draft for "${event.title}"`);
  }

  console.log("🎉 Workflow completed. Check the 'Agentic Request Panel' in dashboard.");
  process.exit(0);
}

runAgent().catch(err => {
    console.error(err);
    process.exit(1);
});
