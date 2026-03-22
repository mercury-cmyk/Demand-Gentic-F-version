import { getRedisConnectionAsync } from './server/lib/queue';

async function run() {
  console.log('before redis');
  const conn = await getRedisConnectionAsync();
  console.log('after redis', conn ? conn.status : 'none');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});