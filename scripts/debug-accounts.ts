import '../server/env';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws as any;

async function main() {
  const prod = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const dev = new Pool({ connectionString: process.env.DATABASE_URL_DEV, max: 1 });
  
  // Get accounts columns and their types from PROD
  const { rows: prodCols } = await prod.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name='accounts' ORDER BY ordinal_position`
  );
  
  // Get accounts columns from DEV
  const { rows: devCols } = await dev.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name='accounts' ORDER BY ordinal_position`
  );
  
  const devColSet = new Set(devCols.map((c: any) => c.column_name));
  
  console.log('=== accounts special column types (prod) ===');
  for (const c of prodCols) {
    const inDev = devColSet.has(c.column_name) ? '' : ' [NOT IN DEV]';
    if (c.data_type === 'json' || c.data_type === 'jsonb' || c.data_type === 'ARRAY' || c.udt_name.startsWith('_')) {
      console.log(`  ${c.column_name}: data_type=${c.data_type} udt_name=${c.udt_name}${inDev}`);
    }
  }

  // Get first row and inspect object-typed columns
  const { rows } = await prod.query('SELECT * FROM accounts LIMIT 1');
  const row = rows[0];
  
  console.log('\n=== Sample row - object-typed values ===');
  for (const [key, val] of Object.entries(row)) {
    if (val !== null && typeof val === 'object') {
      const colType = prodCols.find((c: any) => c.column_name === key);
      console.log(`  ${key}: jsType=${typeof val} isArray=${Array.isArray(val)} pgType=${colType?.data_type}/${colType?.udt_name} val=${JSON.stringify(val).slice(0, 150)}`);
    }
  }

  // Now try to insert just one row into dev to see exact error
  console.log('\n=== Attempting single row insert into dev accounts ===');
  const columns = Object.keys(row).filter(c => devColSet.has(c));
  
  for (const col of columns) {
    const val = row[col];
    const colType = prodCols.find((c: any) => c.column_name === col);
    const dtype = colType?.data_type || '';
    
    if (val !== null && typeof val === 'object') {
      let serialized: any;
      if (dtype === 'json' || dtype === 'jsonb') {
        serialized = typeof val === 'string' ? val : JSON.stringify(val);
      } else if (dtype === 'ARRAY' || colType?.udt_name?.startsWith('_')) {
        serialized = val;
      } else {
        serialized = JSON.stringify(val);
      }
      console.log(`  ${col} (${dtype}): original=${JSON.stringify(val).slice(0, 80)} → serialized=${typeof serialized === 'string' ? serialized.slice(0, 80) : JSON.stringify(serialized).slice(0, 80)}`);
    }
  }
  
  // Try column by column insert
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const params: any[] = [];
  
  for (const col of columns) {
    const val = row[col];
    const colType = prodCols.find((c: any) => c.column_name === col);
    const dtype = colType?.data_type || '';
    
    if (val === null || val === undefined) {
      params.push(val);
    } else if (dtype === 'json' || dtype === 'jsonb') {
      params.push(typeof val === 'string' ? val : JSON.stringify(val));
    } else if (dtype === 'ARRAY' || colType?.udt_name?.startsWith('_')) {
      params.push(val);
    } else if (typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
      params.push(JSON.stringify(val));
    } else {
      params.push(val);
    }
  }
  
  const quotedCols = columns.map(c => `"${c}"`).join(', ');
  try {
    await dev.query(`INSERT INTO "accounts" (${quotedCols}) VALUES (${placeholders.join(', ')})`, params);
    console.log('SUCCESS');
  } catch (err: any) {
    console.log(`FAILED: ${err.message}`);
    // Try to find which column causes the error by inserting one at a time
    console.log('\n=== Binary search for failing column ===');
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const val = params[i];
      try {
        // Try a CAST to see what Postgres thinks
        await dev.query(`SELECT $1::text`, [val]);
      } catch (e: any) {
        console.log(`  Column ${col} (param index ${i}): FAILS cast - ${e.message.slice(0, 100)}`);
      }
    }
  }
  
  await prod.end();
  await dev.end();
}
main().catch(e => { console.error(e); process.exit(1); });
