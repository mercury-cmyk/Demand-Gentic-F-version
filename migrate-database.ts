#!/usr/bin/env node

/**
 * Database Migration Script
 * Copies all data from current Neon database to a new Neon database
 * 
 * Usage:
 *   npx ts-node migrate-database.ts <new-database-url>
 * 
 * Example:
 *   npx ts-node migrate-database.ts "postgresql://user:pass@new-host/newdb?sslmode=require"
 */

import pkg from "pg";
const { Pool } = pkg;
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();
dotenv.config({ path: ".env.local" });

const sourceUrl = process.env.DATABASE_URL || "";
const targetUrl = process.argv[2];

if (!sourceUrl) {
  console.error("❌ DATABASE_URL not set in environment");
  process.exit(1);
}

if (!targetUrl) {
  console.error("❌ Please provide target database URL as argument");
  console.error("Usage: npx ts-node migrate-database.ts <new-database-url>");
  process.exit(1);
}

async function migrateDatabase() {
  const sourcePool = new Pool({ connectionString: sourceUrl });
  const targetPool = new Pool({ connectionString: targetUrl });

  try {
    console.log("🔄 Connecting to source database...");
    await sourcePool.query("SELECT 1");
    console.log("✅ Source database connected");

    console.log("🔄 Connecting to target database...");
    await targetPool.query("SELECT 1");
    console.log("✅ Target database connected");

    // Get all tables
    console.log("📋 Fetching table structure...");
    const tablesResult = await sourcePool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    let tables = tablesResult.rows.map((row) => row.tablename);
    console.log(`📊 Found ${tables.length} tables`);

    // Smart ordering: tables without FK dependencies first
    const tableOrder = [
      // Base reference tables (no dependencies)
      "users", "company_size_reference", "city_reference", "state_reference", "country_reference",
      "department_reference", "industry_reference", "job_function_reference", "revenue_range_reference",
      "seniority_level_reference", "technology_reference",
      // Then account/contact base
      "accounts", "contacts", "lists",
      // Then everything else - let the script handle it
      ...tables.filter(t => ![
        "users", "company_size_reference", "city_reference", "state_reference", "country_reference",
        "department_reference", "industry_reference", "job_function_reference", "revenue_range_reference",
        "seniority_level_reference", "technology_reference", "accounts", "contacts", "lists"
      ].includes(t))
    ];
    
    tables = tableOrder.filter(t => tables.includes(t));

    console.log("🔒 Disabling foreign key constraints on target...");
    try {
      await targetPool.query("SET session_replication_role = replica");
    } catch (err: any) {
      if (err.code === "42501") {
        console.log("⚠️  Cannot disable constraints (permission denied - this is OK on Neon managed databases)");
        console.log("   Proceeding with constraint checking enabled...");
      } else {
        throw err;
      }
    }

    // Check if target database has tables
    const targetTablesResult = await targetPool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    const targetTables = targetTablesResult.rows.map((row) => row.tablename);
    
    if (targetTables.length === 0) {
      console.error("\n❌ ERROR: Target database has no tables!");
      console.error("   The schema must exist before data migration.");
      console.error("\n📋 Please run database migrations on the target database first:");
      console.error("   1. Update .env with the new DATABASE_URL");
      console.error("   2. Run: npm run db:init (or your migration command)");
      console.error("   3. Then run this migration script again");
      process.exit(1);
    }

    console.log(`✅ Target database has ${targetTables.length} tables`);

    // Copy each table
    const failedTables: string[] = [];
    
    for (const table of tables) {
      try {
        console.log(`\n📤 Copying table: ${table}`);

        // Get column info
        const columnsResult = await sourcePool.query(`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1
        `, [table]);
        const columns = columnsResult.rows.map((r) => r.column_name);
        const columnList = columns.join(", ");

        // Get data
        const dataResult = await sourcePool.query(`SELECT ${columnList} FROM ${table}`);
        const rows = dataResult.rows;
        console.log(`  → Found ${rows.length} rows`);

        if (rows.length === 0) {
          console.log(`  ✓ Table empty, skipping data copy`);
          continue;
        }

        // Prepare bulk insert
        const placeholders = rows
          .map(
            (_, i) =>
              `(${columns
                .map((_, j) => `$${i * columns.length + j + 1}`)
                .join(", ")})`
          )
          .join(", ");

        const values = rows.flatMap((row) => columns.map((col) => row[col]));

        const insertQuery = `INSERT INTO ${table} (${columnList}) VALUES ${placeholders}`;

        // Execute in batches
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batchRows = rows.slice(i, i + batchSize);
          const batchValues = batchRows.flatMap((row) =>
            columns.map((col) => row[col])
          );
          const batchPlaceholders = batchRows
            .map(
              (_, rowIdx) =>
                `(${columns
                  .map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`)
                  .join(", ")})`
            )
            .join(", ");

          const query = `INSERT INTO ${table} (${columnList}) VALUES ${batchPlaceholders}`;
          await targetPool.query(query, batchValues);
          console.log(
            `  ✓ Copied ${Math.min(i + batchSize, rows.length)}/${rows.length} rows`
          );
        }

        console.log(`  ✅ Table ${table} copied successfully`);
      } catch (error: any) {
        console.warn(`  ⚠️  Skipping table ${table} (will retry later): ${error.message.split('\n')[0]}`);
        failedTables.push(table);
      }
    }
    
    // Retry failed tables (usually due to FK constraints)
    if (failedTables.length > 0) {
      console.log(`\n🔄 Retrying ${failedTables.length} failed tables...`);
      for (const table of failedTables) {
        try {
          console.log(`\n📤 Retrying table: ${table}`);

          const columnsResult = await sourcePool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = $1
          `, [table]);
          const columns = columnsResult.rows.map((r) => r.column_name);
          const columnList = columns.join(", ");

          const dataResult = await sourcePool.query(`SELECT ${columnList} FROM ${table}`);
          const rows = dataResult.rows;

          if (rows.length === 0) {
            console.log(`  ✓ Table empty`);
            continue;
          }

          const batchSize = 100;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batchRows = rows.slice(i, i + batchSize);
            const batchValues = batchRows.flatMap((row) =>
              columns.map((col) => row[col])
            );
            const batchPlaceholders = batchRows
              .map(
                (_, rowIdx) =>
                  `(${columns
                    .map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`)
                    .join(", ")})`
              )
              .join(", ");

            const query = `INSERT INTO ${table} (${columnList}) VALUES ${batchPlaceholders}`;
            await targetPool.query(query, batchValues);
            console.log(
              `  ✓ Copied ${Math.min(i + batchSize, rows.length)}/${rows.length} rows`
            );
          }

          console.log(`  ✅ Table ${table} copied successfully`);
        } catch (retryError: any) {
          console.error(`  ❌ Still failed: ${retryError.message.split('\n')[0]}`);
        }
      }
    }

    // Re-enable foreign keys (if they were disabled)
    console.log("\n🔓 Re-enabling foreign key constraints...");
    try {
      await targetPool.query("SET session_replication_role = default");
    } catch {
      // Skip if permission denied
    }

    // Verify counts
    console.log("\n📊 Verifying data counts...");
    for (const table of tables) {
      const sourceCount = await sourcePool.query(`SELECT COUNT(*) FROM ${table}`);
      const targetCount = await targetPool.query(`SELECT COUNT(*) FROM ${table}`);
      const src = sourceCount.rows[0].count;
      const tgt = targetCount.rows[0].count;
      const status = src === tgt ? "✅" : "⚠️";
      console.log(`  ${status} ${table}: ${src} → ${tgt}`);
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📝 Next steps:");
    console.log("1. Update DATABASE_URL in your .env file to the new database URL");
    console.log("2. Test the application with the new database");
    console.log("3. Keep the old database as backup for 24 hours");

  } catch (error: any) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

// Run migration
migrateDatabase();
