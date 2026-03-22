#!/usr/bin/env node

/**
 * Simple Migration Runner
 * Runs a SQL migration file against the database
 *
 * Usage:
 *   npx ts-node run-migration.ts 
 */

import pkg from "pg";
const { Pool } = pkg;
import * as fs from "fs";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();
dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL || "";
const migrationFile = process.argv[2];

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set in environment");
  process.exit(1);
}

if (!migrationFile) {
  console.error("❌ Please provide migration file path as argument");
  console.error("Usage: npx ts-node run-migration.ts ");
  process.exit(1);
}

if (!fs.existsSync(migrationFile)) {
  console.error(`❌ Migration file not found: ${migrationFile}`);
  process.exit(1);
}

async function runMigration() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log(`🔄 Connecting to database...`);
    await pool.query("SELECT 1");
    console.log("✅ Database connected");

    console.log(`📄 Reading migration file: ${migrationFile}`);
    const sql = fs.readFileSync(migrationFile, "utf8");

    console.log(`🚀 Running migration...`);
    await pool.query(sql);

    console.log("✅ Migration completed successfully!");
  } catch (error: any) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();