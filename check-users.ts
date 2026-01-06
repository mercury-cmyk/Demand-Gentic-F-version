
import { db } from "./server/db";
import { users } from "@shared/schema";

async function checkUsers() {
  console.log("\n📋 Available Users:");
  console.log("==================\n");
  
  const allUsers = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    role: users.role
  }).from(users);
  
  allUsers.forEach(user => {
    console.log(`👤 Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   ID: ${user.id}`);
    console.log("");
  });
  
  console.log("\n💡 Try logging in with:");
  console.log("   Username: admin");
  console.log("   Password: admin123");
  console.log("\n   OR");
  console.log("\n   Username: agent");
  console.log("   Password: agent123\n");
  
  process.exit(0);
}

checkUsers().catch(console.error);
