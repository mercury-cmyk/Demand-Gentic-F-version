require('dotenv').config({path:'.env'});
const {Pool}=require('pg');
const pool=new Pool({connectionString: process.env.DATABASE_URL});
(async()=>{
  try {
    const {rows} = await pool.query("select ai_transcript from call_sessions where id='b2f578a6-970c-46e9-8408-0f2e4f81e49e'");
    const t = rows[0]?.ai_transcript;
    console.log('type', typeof t);
    try {
      const arr = JSON.parse(t);
      console.log('parsed length', Array.isArray(arr)?arr.length:'not array');
      console.log('first two messages', Array.isArray(arr)?arr.slice(0,2):null);
    } catch(e){
      console.error('parse error', e.message);
      console.log('raw snippet', t?.slice(0,400));
    }
  } catch(e){console.error(e);} finally {await pool.end();}
})();
