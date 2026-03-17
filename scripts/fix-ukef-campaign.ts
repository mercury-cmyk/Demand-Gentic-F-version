import { db } from "../server/db";
import { campaigns } from "@shared/schema";
import { eq } from "drizzle-orm";

async function run() {
  const campaignId = "70434f6e-3ab6-49e4-acf7-350b81f60ea2"; // UKEF_Q12026
  
  // Create objections array
  const objections = [
    {
      objection: "We don't need financing right now.",
      response: "That's completely fine. This isn't a sales call for financial products. We are simply offering a free, insightful white paper titled 'Leading with Finance' that provides valuable information for UK businesses involved in international trade. May I send this free resource to your email?"
    },
    {
      objection: "I'm not the right person. Or, I don't handle that.",
      response: "No problem at all. Could you point me to the person who handles your international expansion or financial strategy? We'd love to share this free resource with them."
    },
    {
      objection: "I'm too busy. Or, Can you just email me?",
      response: "I completely understand you're busy, which is exactly why I'm calling. I just need to confirm your email address so I can send over the free 'Leading with Finance' white paper from UK Export Finance. What's the best email to use?"
    },
    {
      objection: "We already use a different finance provider or bank.",
      response: "That makes sense. This isn't to replace your current provider. It's simply a free educational white paper published by UK Export Finance containing insights on mitigating risks in international trade. It's completely complimentary. May I send it over?"
    }
  ];

  // Create context brief
  const contextBrief = `Objective: Distribute the 'Leading with Finance' white paper from UK Export Finance to UK business decision makers and get their consent to send it via email.
Targeting: UK-based business owners and decision-makers involved in exporting or considering expanding into international markets.
Success: Interest confirmed and consent obtained for the email.
Product/Service: A FREE informative white paper titled Leading with Finance, published by UK Export Finance. It is a complimentary resource, not a sales pitch for financial products.
Key Points: Introduce yourself clearly; Emphasize this is a free resource and NOT a sales call; Confirm their email address and secure consent to send it; Thank them for their time.`;

  console.log(`Updating UKEF_Q12026 campaign (${campaignId})...`);
  
  await db.update(campaigns)
    .set({
      callFlow: null, // Remove rigid state machine
      campaignObjections: objections,
      campaignContextBrief: contextBrief
    })
    .where(eq(campaigns.id, campaignId));
    
  console.log("Database update successful.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
