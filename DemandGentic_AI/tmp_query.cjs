require('dotenv').config({path:'.env'});
const {Pool}=require('pg');
const pool=new Pool({connectionString: process.env.DATABASE_URL});
(async()=>{try{const res=await pool.query("select id, username, email, first_name, last_name from users where first_name ilike '%zahid%' or first_name ilike '%tabo%' or last_name ilike '%zahid%' or last_name ilike '%tabo%' limit 10"); console.log(res.rows);}catch(e){console.error(e);} finally{await pool.end();}})();