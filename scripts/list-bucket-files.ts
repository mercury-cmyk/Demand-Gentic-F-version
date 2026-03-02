
import { Storage } from '@google-cloud/storage';
import * as dotenv from 'dotenv';
dotenv.config();

const BUCKET_NAME = process.env.GCS_BUCKET || 'demandgentic-ai-storage';
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

import * as fs from 'fs';

async function listFiles() {
  const logFile = 'scripts/bucket-listing.txt';
  fs.writeFileSync(logFile, '--- STARTING FILE LISTING ---\n');
  
  console.log('--- STARTING FILE LISTING ---');
  console.log(`Listing files in bucket: ${BUCKET_NAME} with prefix "recordings/"`);
  try {
    const [files] = await bucket.getFiles({ prefix: 'recordings/', maxResults: 50 });
    console.log(`Found ${files.length} files in recordings/ (showing first 50):`);
    
    fs.appendFileSync(logFile, `Found ${files.length} files in recordings/ (showing first 50):\n`);
    
    files.forEach(file => {
      const line = `- ${file.name} (${file.metadata.size} bytes) - Updated: ${file.metadata.updated}\n`;
      console.log(line.trim());
      fs.appendFileSync(logFile, line);
    });

    console.log(`\nListing files in bucket: ${BUCKET_NAME} with prefix "call-recordings/"`);
    const [files2] = await bucket.getFiles({ prefix: 'call-recordings/', maxResults: 50 });
    console.log(`Found ${files2.length} files in call-recordings/ (showing first 50):`);
    
    fs.appendFileSync(logFile, `Found ${files2.length} files in call-recordings/ (showing first 50):\n`);
    
    files2.forEach(file => {
      const line = `- ${file.name} (${file.metadata.size} bytes) - Updated: ${file.metadata.updated}\n`;
      console.log(line.trim());
      fs.appendFileSync(logFile, line);
    });

  } catch (error) {
    console.error('Error listing files:', error);
    fs.appendFileSync(logFile, `Error: ${JSON.stringify(error)}\n`);
  }
}

listFiles();
