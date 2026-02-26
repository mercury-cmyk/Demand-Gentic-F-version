import { db } from "./server/db";
import { virtualAgents } from "@shared/schema";
import { sql } from "drizzle-orm";

async function listVirtualAgents() {
  console.log("=".repeat(80));
  console.log("VIRTUAL AGENT LIST");
  console.log("=".repeat(80));

  try {
    const agents = await db.select({
      id: virtualAgents.id,
      name: virtualAgents.name,
      systemPrompt: virtualAgents.systemPrompt,
    }).from(virtualAgents);

    if (agents.length === 0) {
      console.log("
No virtual agents found in the database.");
      return;
    }

    console.log(`
Found ${agents.length} virtual agents:
`);

    agents.forEach(agent => {
      console.log(`ID: ${agent.id}`);
      console.log(`Name: ${agent.name}`);
      console.log(`System Prompt (first 100 chars): ${agent.systemPrompt?.substring(0, 100) || '[EMPTY]'}`);
      console.log("-".repeat(40));
    });

  } catch (error) {
    console.error("
❌ Error fetching virtual agents:", error);
  }
}

listVirtualAgents()
  .then(() => {
    console.log("
✅ Script complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("
❌ Script failed:", error);
    process.exit(1);
  });
