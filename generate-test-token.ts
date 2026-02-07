import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Load .env first, then .env.local to override
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Match the default from server/auth.ts
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

// Generate a test token for user with admin privileges
const testToken = jwt.sign(
  {
    userId: 1,
    email: 'admin@demandgentic.ai',
    role: 'admin'
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('\n=== TEST JWT TOKEN ===');
console.log(testToken);
console.log('\nAdd this to .env.local as:');
console.log(`TEST_AUTH_TOKEN="${testToken}"`);
