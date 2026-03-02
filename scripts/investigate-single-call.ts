
import { db } from "../server/db";
import { dialerCallAttempts, leads } from "../shared/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import * as fs from 'fs';

// We import the bucket from storage to check file existence
const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-ai-storage';
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET);

const LOG_FILE = 'scripts/investigation-result.txt';

async function investigateCall() {
  const targetCallId = 'b3e49d1e-c2dd-4c77-8acd-02c6f7a02255';
  fs.writeFileSync(LOG_FILE, `Investigating Call ID: ${targetCallId}\n`);
  
  const call = await db.query.dialerCallAttempts.findFirst({
    where: eq(dialerCallAttempts.telnyxCallId, targetCallId),
  });

  if (!call) {
    fs.appendFileSync(LOG_FILE, 'Call NOT found in DB.\n');
    return;
  }
  
  fs.appendFileSync(LOG_FILE, `Call Found in DB. CampaignID: ${call.campaignId}\n`);
  
  const possiblePaths = [
    `recordings/${targetCallId}.wav`,
    `recordings/${targetCallId}.mp3`,
    `call-recordings/${targetCallId}.wav`, // Unlikely but check
    `call-recordings/${targetCallId}.mp3`,
    `call-recordings/${call.campaignId}/${targetCallId}.wav`,
    `call-recordings/${call.campaignId}/${targetCallId}.mp3`
  ];

  for (const path of possiblePaths) {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    fs.appendFileSync(LOG_FILE, `Checking path: ${path} -> Exists: ${exists}\n`);
    
    if (exists) {
        fs.appendFileSync(LOG_FILE, 'FOUND FILE!\n');
    }
  }
  
  process.exit(0);
}

investigateCall();
