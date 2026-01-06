/// <reference types="node" />
import "dotenv/config";
import axios from "axios";
import * as readline from "readline";

const API_URL = process.env.API_URL || "http://localhost:5000";

async function login() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log("🔐 Authentication Token Generator");
  console.log("=".repeat(60));
  console.log(`API URL: ${API_URL}\n`);

  try {
    const username = await question("Username: ");
    const password = await question("Password: ");

    console.log("\n📡 Logging in...");

    const response = await axios.post(
      `${API_URL}/api/auth/login`,
      { username, password },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.token) {
      console.log("\n✅ Login successful!");
      console.log("\n📋 Your authentication token:");
      console.log("-".repeat(60));
      console.log(response.data.token);
      console.log("-".repeat(60));
      console.log("\n💡 To use this token with the audio test:");
      console.log("   PowerShell:");
      console.log(`   $env:AUTH_TOKEN='${response.data.token}'`);
      console.log("   npx tsx test-audio-transmission.ts");
      console.log("\n   Or add to .env file:");
      console.log(`   AUTH_TOKEN=${response.data.token}`);
    } else {
      console.error("❌ No token received from server");
    }
  } catch (error: any) {
    if (error.response) {
      console.error(`\n❌ Login failed: ${error.response.data.message || error.response.statusText}`);
    } else if (error.request) {
      console.error("\n❌ Cannot connect to server");
      console.error("   Make sure the server is running: npm run dev");
    } else {
      console.error(`\n❌ Error: ${error.message}`);
    }
  } finally {
    rl.close();
  }
}

login();
