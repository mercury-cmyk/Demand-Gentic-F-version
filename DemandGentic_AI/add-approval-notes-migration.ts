import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function addApprovalNotesColumn() {
  const client = await pool.connect();
  try {
    console.log('Checking for approval_notes column in client_projects...');
    
    // Check if column exists
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'client_projects' AND column_name = 'approval_notes'
    `);

    if (checkRes.rows.length === 0) {
      console.log('Column approval_notes not found. Adding it...');
      await client.query(`
        ALTER TABLE client_projects 
        ADD COLUMN approval_notes text;
      `);
      console.log('Column approval_notes added successfully.');
    } else {
      console.log('Column approval_notes already exists.');
    }

    // Also check for other nullable fields in the schema mentioned previously just in case:
    // approved_by, approved_at, rejection_reason
    
    const otherColumns = ['approved_by', 'approved_at', 'rejection_reason'];
    for (const col of otherColumns) {
       const res = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'client_projects' AND column_name = '${col}'
      `);
      if (res.rows.length === 0) {
        console.log(`Column ${col} not found. Adding it...`);
        let type = 'text';
        if (col.endsWith('_at')) type = 'timestamp';
        if (col === 'approved_by') type = 'varchar REFERENCES users(id) ON DELETE SET NULL';
        
        await client.query(`
          ALTER TABLE client_projects 
          ADD COLUMN ${col} ${type};
        `);
        console.log(`Column ${col} added successfully.`);
      }
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

addApprovalNotesColumn();