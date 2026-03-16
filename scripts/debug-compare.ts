import '../server/env';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws as any;

async function main() {
  const prod = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const dev = new Pool({ connectionString: process.env.DATABASE_URL_DEV, max: 1 });

  const { rows: prodCols } = await prod.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name='accounts' ORDER BY ordinal_position`
  );
  const { rows: devCols } = await dev.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name='accounts' ORDER BY ordinal_position`
  );
  
  const devMap = new Map(devCols.map((c: any) => [c.column_name, c]));
  const prodMap = new Map(prodCols.map((c: any) => [c.column_name, c]));
  
  console.log('=== Column type MISMATCHES between prod and dev ===');
  for (const pc of prodCols) {
    const dc = devMap.get(pc.column_name);
    if (!dc) {
      console.log(`  ${pc.column_name}: IN PROD ONLY (${pc.data_type}/${pc.udt_name})`);
    } else if (pc.data_type !== dc.data_type || pc.udt_name !== dc.udt_name) {
      console.log(`  ${pc.column_name}: PROD=${pc.data_type}/${pc.udt_name} DEV=${dc.data_type}/${dc.udt_name}`);
    }
  }
  for (const dc of devCols) {
    if (!prodMap.has(dc.column_name)) {
      console.log(`  ${dc.column_name}: IN DEV ONLY (${dc.data_type}/${dc.udt_name})`);
    }
  }

  // Now check a specific failing row
  const failId = 'bad4ca8e-2413-4bc0-9150-0b53ca791654';
  const { rows } = await prod.query(`SELECT * FROM accounts WHERE id = $1`, [failId]);
  if (rows.length === 0) {
    console.log('Row not found');
  } else {
    const row = rows[0];
    console.log('\n=== ALL non-null values for failing row ===');
    for (const [key, val] of Object.entries(row)) {
      if (val !== null) {
        const pc = prodMap.get(key);
        const ptype = pc ? `${pc.data_type}/${pc.udt_name}` : '??';
        const dc = devMap.get(key);
        const dtype = dc ? `${dc.data_type}/${dc.udt_name}` : 'NOT IN DEV';
        const jstype = typeof val;
        const preview = jstype === 'object' ? JSON.stringify(val).slice(0, 80) : String(val).slice(0, 80);
        console.log(`  ${key}: prod=${ptype} dev=${dtype} js=${jstype} isArr=${Array.isArray(val)} val=${preview}`);
      }
    }
  }

  await prod.end();
  await dev.end();
}
main().catch(e => { console.error(e); process.exit(1); });
