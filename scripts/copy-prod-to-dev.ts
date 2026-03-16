/**
 * Copy all data from production database to dev database.
 *
 * Reads DATABASE_URL (production) and DATABASE_URL_DEV (dev) from environment.
 * Truncates all dev tables, then copies all rows from prod → dev.
 *
 * Usage: npx tsx scripts/copy-prod-to-dev.ts
 */
import '../server/env';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws as any;

const PROD_URL = process.env.DATABASE_URL;
const DEV_URL = process.env.DATABASE_URL_DEV;

if (!PROD_URL) { console.error('DATABASE_URL (production) not set'); process.exit(1); }
if (!DEV_URL) { console.error('DATABASE_URL_DEV not set'); process.exit(1); }
if (PROD_URL === DEV_URL) { console.error('PROD and DEV URLs are the same — aborting!'); process.exit(1); }

async function main() {
  const prod = new Pool({ connectionString: PROD_URL, max: 3 });
  const dev = new Pool({ connectionString: DEV_URL, max: 3 });

  console.log('=== COPY PRODUCTION → DEV ===');
  console.log(`PROD host: ${new URL(PROD_URL!).hostname}`);
  console.log(`DEV  host: ${new URL(DEV_URL!).hostname}`);

  // 1. Get all user tables from production (in dependency order)
  const { rows: tables } = await prod.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'drizzle%'
    ORDER BY tablename
  `);

  const tableNames = tables.map((t: any) => t.tablename as string);
  console.log(`\nFound ${tableNames.length} tables in production.`);

  // 2. Truncate all dev tables (single TRUNCATE CASCADE handles FK ordering)
  const devClient = await dev.connect();
  try {
    console.log('\n--- Preparing dev database ---');

    // Get tables that actually exist in dev
    const { rows: devTables } = await devClient.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename NOT LIKE 'drizzle%'
    `);
    const devTableNames = devTables.map((t: any) => t.tablename as string);

    if (devTableNames.length > 0) {
      // Single TRUNCATE ... CASCADE handles all FK dependencies
      const quotedList = devTableNames.map(t => `"${t}"`).join(', ');
      await devClient.query(`TRUNCATE TABLE ${quotedList} CASCADE`);
      console.log(`Truncated ${devTableNames.length} tables in dev.`);
    }

    // 3. Build FK dependency order for inserts (parents first)
    const { rows: fkRows } = await prod.query(`
      SELECT DISTINCT
        tc.table_name AS child,
        ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_schema = 'public'
        AND tc.table_name != ccu.table_name
    `);

    // Topological sort — parents before children
    const deps = new Map<string, Set<string>>();
    for (const t of tableNames) deps.set(t, new Set());
    for (const { child, parent } of fkRows) {
      if (deps.has(child) && deps.has(parent)) {
        deps.get(child)!.add(parent);
      }
    }

    const sorted: string[] = [];
    const visited = new Set<string>();
    function visit(name: string) {
      if (visited.has(name)) return;
      visited.add(name);
      for (const dep of deps.get(name) || []) visit(dep);
      sorted.push(name);
    }
    for (const t of tableNames) visit(t);

    // 4. Copy data table by table in dependency order
    console.log('\n--- Copying data ---');
    let totalRows = 0;
    const errors: string[] = [];

    const READ_BATCH = 5000; // Read 5000 rows at a time from prod to avoid OOM
    const INSERT_BATCH = 500; // Insert 500 rows at a time into dev

    for (const table of sorted) {
      try {
        // Get row count first
        const { rows: countRows } = await prod.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
        const totalInTable = parseInt(countRows[0].cnt, 10);
        if (totalInTable === 0) {
          console.log(`  [empty] ${table}`);
          continue;
        }

        // Check if table exists in dev and get column names + types
        const { rows: devColRows } = await devClient.query(
          `SELECT column_name, data_type, udt_name FROM information_schema.columns 
           WHERE table_schema='public' AND table_name=$1`, [table]
        );
        if (devColRows.length === 0) {
          console.log(`  [skip]  ${table}: does not exist in dev`);
          continue;
        }
        const devColumns = new Map<string, string>();
        for (const r of devColRows) {
          devColumns.set(r.column_name, r.data_type);
        }

        // Get prod column types for serialization decisions
        const { rows: prodColRows } = await prod.query(
          `SELECT column_name, data_type, udt_name FROM information_schema.columns 
           WHERE table_schema='public' AND table_name=$1`, [table]
        );
        const prodColTypes = new Map<string, string>();
        for (const r of prodColRows) {
          prodColTypes.set(r.column_name, r.data_type);
        }

        function serializeRow(row: any, columns: string[]) {
          const params: any[] = [];
          for (const col of columns) {
            const val = row[col];
            const dtype = prodColTypes.get(col) || '';

            if (val === null || val === undefined) {
              params.push(val);
            } else if (dtype === 'jsonb') {
              params.push(JSON.stringify(val));
            } else if (dtype === 'json') {
              params.push(val);
            } else if (dtype === 'ARRAY' || dtype.startsWith('_')) {
              params.push(val);
            } else if (typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
              params.push(JSON.stringify(val));
            } else {
              params.push(val);
            }
          }
          return params;
        }

        let inserted = 0;
        let columns: string[] | null = null;
        let quotedCols = '';

        // Read from prod in pages of READ_BATCH
        for (let offset = 0; offset < totalInTable; offset += READ_BATCH) {
          const { rows } = await prod.query(
            `SELECT * FROM "${table}" LIMIT ${READ_BATCH} OFFSET ${offset}`
          );
          if (rows.length === 0) break;

          // Determine columns from first batch
          if (!columns) {
            const allProdCols = Object.keys(rows[0]);
            columns = allProdCols.filter(c => devColumns.has(c));
            quotedCols = columns.map(c => `"${c}"`).join(', ');
          }

          // Insert in sub-batches of INSERT_BATCH
          for (let i = 0; i < rows.length; i += INSERT_BATCH) {
            const batch = rows.slice(i, i + INSERT_BATCH);
            const valueParts: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            for (const row of batch) {
              const placeholders = columns!.map(() => `$${paramIdx++}`);
              valueParts.push(`(${placeholders.join(', ')})`);
              params.push(...serializeRow(row, columns!));
            }

            try {
              await devClient.query(
                `INSERT INTO "${table}" (${quotedCols}) VALUES ${valueParts.join(', ')}`,
                params
              );
              inserted += batch.length;
            } catch (batchErr: any) {
              // Batch failed — retry row by row
              for (const row of batch) {
                const rowParams = serializeRow(row, columns!);
                const rowPlaceholders = columns!.map((_, idx) => `$${idx + 1}`);
                try {
                  await devClient.query(
                    `INSERT INTO "${table}" (${quotedCols}) VALUES (${rowPlaceholders.join(', ')})`,
                    rowParams
                  );
                  inserted++;
                } catch (rowErr: any) {
                  if (!errors.find(e => e.startsWith(table + ':'))) {
                    const id = row.id || row[columns![0]];
                    errors.push(`${table}: ${(rowErr as any).message?.slice(0, 120)}`);
                    console.log(`  [ROW]   ${table} id=${id}: ${(rowErr as any).message?.slice(0, 200)}`);
                  }
                }
              }
            }
          }
        }

        totalRows += inserted;
        if (inserted === totalInTable) {
          console.log(`  [ok]    ${table}: ${inserted} rows`);
        } else if (inserted > 0) {
          console.log(`  [PARTIAL] ${table}: ${inserted}/${totalInTable} rows`);
        } else {
          console.log(`  [FAIL]  ${table}: 0/${totalInTable} rows`);
        }
      } catch (err: any) {
        const msg = `${table}: ${err.message?.slice(0, 120)}`;
        errors.push(msg);
        console.log(`  [ERROR] ${msg}`);
      }
    }

    console.log(`\n=== DONE ===`);
    console.log(`Copied ${totalRows} total rows across ${tableNames.length} tables.`);
    if (errors.length > 0) {
      console.log(`\n${errors.length} tables had errors:`);
      errors.forEach(e => console.log(`  - ${e}`));
    }
  } finally {
    devClient.release();
  }

  await prod.end();
  await dev.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
