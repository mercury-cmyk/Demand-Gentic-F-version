import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./server/db";
import { domainAuth } from "./shared/schema";

async function checkDomains() {
  try {
    console.log("Checking domains in DB...");
    
    // Try inserting a test domain
    const testDomain = `test-${Date.now()}.com`;
    console.log(`Inserting test domain: ${testDomain}`);
    const [inserted] = await db.insert(domainAuth).values({
      domain: testDomain,
      spfStatus: 'pending',
      dkimStatus: 'pending',
      dmarcStatus: 'pending',
      trackingDomainStatus: 'pending'
    }).returning();
    console.log("Inserted:", inserted);

    const domains = await db.select().from(domainAuth);
    console.log("Domains in DB:", JSON.stringify(domains, null, 2));

    console.log("Testing API...");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/test-domain-auth");
      console.log("API Status:", res.status);
      console.log("API Body:", await res.text());
    } catch (e) {
      console.error("API Fetch failed:", e);
    }
  } catch (error) {
    console.error("Error fetching domains:", error);
  }
  process.exit(0);
}

checkDomains();