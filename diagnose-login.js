
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const bcrypt = require('bcryptjs');

async function diagnose() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  try {
    console.log('🔍 Diagnosing login issue...\n');
    
    // Check if user exists
    const result = await client`
      SELECT id, username, email, password, role 
      FROM users 
      WHERE username = 'admin'
    `;
    
    if (result.length === 0) {
      console.log('❌ No admin user found in database');
      await client.end();
      process.exit(1);
    }
    
    const user = result[0];
    console.log('✅ Admin user found:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   Password hash:', user.password.substring(0, 20) + '...');
    
    // Test password
    const testPassword = 'admin123';
    const isValid = await bcrypt.compare(testPassword, user.password);
    
    console.log('\n🔐 Password test:');
    console.log('   Testing password: admin123');
    console.log('   Result:', isValid ? '✅ VALID' : '❌ INVALID');
    
    if (!isValid) {
      console.log('\n⚠️  Password does not match! Updating...');
      const newHash = await bcrypt.hash('admin123', 10);
      await client`
        UPDATE users 
        SET password = ${newHash}
        WHERE username = 'admin'
      `;
      console.log('✅ Password updated successfully');
      
      // Verify again
      const verify = await bcrypt.compare('admin123', newHash);
      console.log('   Verification:', verify ? '✅ VALID' : '❌ STILL INVALID');
    }
    
    await client.end();
    console.log('\n✅ Diagnosis complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

diagnose();
