const {Pool}=require('pg');
const pool=new Pool({connectionString: process.env.DATABASE_URL});
(async()=>{
  try {
    const sql = "select id, left(coalesce(ai_transcript,''),200) as snippet, length(ai_transcript) as len, started_at from call_sessions where ai_transcript is not null order by started_at desc limit 5";
    const res = await pool.query(sql);
    console.log(res.rows);
  } catch(e){
    console.error(e);
  } finally {
    await pool.end();
  }
})();
