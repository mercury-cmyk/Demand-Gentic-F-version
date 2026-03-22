/**
 * Verify booking page configuration
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function verifyBooking() {
  console.log('=== Verify Booking Configuration ===\n');

  try {
    // Check admin user
    const adminResult = await db.execute(sql`
      SELECT id, username, email, first_name, last_name
      FROM users
      WHERE username = 'admin'
      LIMIT 1
    `);

    if (adminResult.rows.length === 0) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }

    const admin = adminResult.rows[0] as any;
    console.log(`✅ Admin user found:`);
    console.log(`   ID: ${admin.id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email: ${admin.email}\n`);

    // Check booking types for admin
    const typesResult = await db.execute(sql`
      SELECT id, name, slug, duration, description, is_active, created_at
      FROM booking_types
      WHERE user_id = ${admin.id}
      ORDER BY slug
    `);

    console.log(`Booking Types for ${admin.username}:`);
    if (typesResult.rows.length === 0) {
      console.log('  ❌ No booking types found');
    } else {
      typesResult.rows.forEach((type: any, i: number) => {
        console.log(`  [${i + 1}] ${type.name}`);
        console.log(`      Slug: ${type.slug}`);
        console.log(`      Duration: ${type.duration} min`);
        console.log(`      Active: ${type.is_active}`);
        console.log(`      URL: /book/${admin.username}/${type.slug}`);
        console.log();
      });
    }

    // Check if demo specifically exists
    const demoResult = await db.execute(sql`
      SELECT id, slug, is_active
      FROM booking_types
      WHERE user_id = ${admin.id} AND slug = 'demo'
    `);

    if (demoResult.rows.length > 0) {
      const demo = demoResult.rows[0] as any;
      console.log(`✅ Demo booking found!`);
      console.log(`   Active: ${demo.is_active}`);
      console.log(`   URL: https://demandgentic.ai/book/${admin.username}/demo`);
    } else {
      console.log(`❌ Demo booking NOT found for admin user`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyBooking();