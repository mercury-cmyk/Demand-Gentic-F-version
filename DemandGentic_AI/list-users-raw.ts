import { db } from "./server/db";
import { users } from "./shared/schema";

async function main() {
  const allUsers = await db.select().from(users);
  console.log(JSON.stringify(allUsers, null, 2));
}

main().catch(console.error);