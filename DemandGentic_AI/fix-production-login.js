/**
 * Fix Production Database Login
 * This script updates the admin password in the production database
 */

import { neon } from '@neondatabase/serverless';
const bcrypt = require('bcryptjs');

async function fixProductionLogin() {
  // Use DATABASE_URL from environment (this will be deployed when deployed)
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  console.log('🔧 Fixing production database login...\n');

  const sql = neon(databaseUrl);

  try {
    // Generate new password hash
    const password = 'admin123';
    // Use salt rounds of 10 to match auth.ts
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('🔑 Generated new password hash');

    // Update admin user password
    const result = await sql`
      UPDATE users 
      SET password = ${hashedPassword}
      WHERE username = 'admin'
      RETURNING id, username, email, role
    `;

    if (result.length === 0) {
      console.log('⚠️  Admin user not found. Creating new admin user...');

      // Create admin user if not exists
      const newUser = await sql`
        INSERT INTO users (username, email, password, role, first_name, last_name)
        VALUES ('admin', 'admin@crm.local', ${hashedPassword}, 'admin', 'System', 'Administrator')
        RETURNING id, username, email, role
      `;

      console.log('✅ Admin user created:');
      console.log('   Username:', newUser[0].username);
      console.log('   Email:', newUser[0].email);
      console.log('   Role:', newUser[0].role);
    } else {
      console.log('✅ Admin password updated:');
      console.log('   Username:', result[0].username);
      console.log('   Email:', result[0].email);
      console.log('   Role:', result[0].role);
    }

    console.log('\n🎉 Production login fixed!');
    console.log('\n📋 Login Credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n⚠️  Important: Change this password after first login!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixProductionLogin();