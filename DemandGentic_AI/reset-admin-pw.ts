import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await db.update(users)
    .set({ password: hashedPassword })
    .where(eq(users.username, "admin"));
  console.log("Password for 'admin' reset to 'admin123'");
}

main().catch(console.error);