
import { storage } from './server/storage';

async function checkData() {
  try {
    console.log("Checking database data...");
    const users = await storage.getUsers();
    console.log(`Users found: ${users.length}`);
    
    // You might want to check other entities too if possible, 
    // but storage.ts is huge and I don't know all methods offhand.
    // Let's check accounts if the method exists.
    // storage.ts has 'accounts' table, let's see if there is getAccounts.
    // I'll just check users for now as a proxy for "is the DB empty".
    
    if (users.length > 0) {
      console.log("First user:", users[0].username);
    } else {
      console.log("No users found in the database.");
    }
  } catch (error) {
    console.error("Error checking data:", error);
  }
  process.exit(0);
}

checkData();
