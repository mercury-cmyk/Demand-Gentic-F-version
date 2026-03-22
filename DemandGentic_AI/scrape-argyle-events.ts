import axios from 'axios';
import { db } from './server/db';
import { campaignIntakeRequests, clientAccounts } from './shared/schema';
import { eq, sql } from 'drizzle-orm';

const TARGET_URL = 'https://argyleforum.com/events-landing/';

async function scrapeAndCreateDrafts() {
    console.log('Starting Argyle Event Scraper Agent...');

    // 1. Find Client Account
    console.log('Locating Client Account: Argyle...');
    const clients = await db.select().from(clientAccounts)
        .where(eq(clientAccounts.companyName, 'Argyle'))
        .limit(1);

    if (clients.length === 0) {
        console.error('Error: "Argyle" client account not found in database.');
        process.exit(1);
    }
    const client = clients[0];
    console.log(`Found Client: ${client.companyName} (${client.id})`);

    // 2. Fetch Website
    console.log(`Fetching events from ${TARGET_URL}...`);
    let htmlContent = '';
    try {
        const response = await axios.get(TARGET_URL);
        htmlContent = response.data;
    } catch (error) {
        console.error('Failed to fetch website:', error);
        process.exit(1);
    }

    // 3. Extract Events (Regex based on expected HTML structure)
    // We look for links to /events/ that are NOT the landing page itself
    const eventLinkRegex = /]*?\s+)?href=["'](https:\/\/argyleforum\.com\/events\/[^"']+\/?)["'][^>]*>([\s\S]*?)/gi;
    
    // Also try to find date/title if possible. usually inside the anchor or near it.
    // For now, simple extraction of Link and Text.
    
    const events = new Map();

    let match;
    while ((match = eventLinkRegex.exec(htmlContent)) !== null) {
        const link = match[1];
        let text = match[2]
            .replace(/]+>/g, ' ') // Remove HTML tags
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .trim();

        if (!link || link.includes('events-landing') || link.includes('page/')) continue;
        
        // Basic Title Cleanup (Argyle specific heuristics)
        // Usually contains "Forum", "Webinar", Date
        // Example text: "Finance From Disconnected... February 11, 2026 | Virtual"
        
        // Try to extract date
        // Pattern: Month DD, YYYY
        const dateMatch = text.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
        const date = dateMatch ? dateMatch[0] : null;

        // Use text as title for now, user can edit
        const title = text;

        if (!events.has(link)) {
            events.set(link, { title, link, date, raw: text });
        }
    }

    console.log(`Found ${events.size} potential events.`);

    // 4. Process and Insert
    let createdCount = 0;
    let skippedCount = 0;

    for (const [link, event] of events) {
        // Filter unique by checking if we already imported this link for this client
        // We'll query rawInput->>'eventLink'
        
        const existing = await db.execute(sql`
            SELECT id FROM campaign_intake_requests 
            WHERE client_account_id = ${client.id}
            AND raw_input->>'eventLink' = ${link}
        `);

        if ((existing.rowCount ?? 0) > 0) {
            skippedCount++;
            continue;
        }

        // infer campaignType
        let campaignType = 'webinar_invite'; // Default
        const lowerTitle = event.title.toLowerCase();
        if (lowerTitle.includes('forum') || lowerTitle.includes('summit')) {
            campaignType = 'conference'; // or 'leadership_forum' if available logic
        } else if (lowerTitle.includes('dinner')) {
            campaignType = 'executive_dinner';
        }

        // Create Draft
        console.log(`Creating draft for: ${event.date || 'Unknown Date'} - ${event.title.substring(0, 50)}...`);
        
        await db.insert(campaignIntakeRequests).values({
            clientAccountId: client.id,
            sourceType: 'agentic_hub', // Identified as coming from the agent
            status: 'draft', // Draft state for user to complete
            campaignType: campaignType,
            
            // Store all details for the UI to populate
            rawInput: {
                eventLink: event.link,
                eventTitle: event.title,
                eventDate: event.date,
                originalText: event.raw,
                description: `Imported from Argyle Events page. Link: ${event.link}`
            },
            
            // We can also populate extractedContext if we want structured data access
            extractedContext: {
                title: event.title,
                url: event.link,
                date: event.date
            },

            // Set priority default
            priority: 'normal'
        });

        createdCount++;
    }

    console.log(`\nSummary:`);
    console.log(`- Scanned: ${events.size}`);
    console.log(`- Created: ${createdCount} new drafts`);
    console.log(`- Skipped: ${skippedCount} existing drafts`);

    process.exit(0);
}

scrapeAndCreateDrafts().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});