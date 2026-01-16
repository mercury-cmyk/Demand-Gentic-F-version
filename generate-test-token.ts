import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const JWT_SECRET = process.env.JWT_SECRET || '4f34480d3577e15deefcdf3be6e875afc6f2304ac4870f89dfb550076314fb45';

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
