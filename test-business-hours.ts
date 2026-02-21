/**
 * Test the business hours logic with campaign config
 * Simulates what happens when orchestrator processes Saturday contacts
 */

import {  isWithinBusinessHours
} from "./server/utils/business-hours";

async function testBusinessHoursLogic() {
  console.log("=== TEST: Business Hours Logic ===\n");
  
  // Simulate the campaign config we verified is in the database
  const campaignConfig = {
    enabled: true,
    operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
    startTime: "09:00",
    endTime: "18:00",
    timezone: "America/New_York",
    respectContactTimezone: true
  };
  
  // Test different days
  const testCases = [
    { name: "Friday 10 AM EST", date: new Date("2026-02-20T15:00:00Z") },  // Friday 10 AM EST
    { name: "Saturday 10 AM EST", date: new Date("2026-02-21T15:00:00Z") },  // Saturday 10 AM EST (today!)
    { name: "Sunday 10 AM EST", date: new Date("2026-02-22T15:00:00Z") },   // Sunday 10 AM EST
    { name: "Saturday 08:00 AM EST (before hours)", date: new Date("2026-02-21T13:00:00Z") },
    { name: "Saturday 6 PM EST (after hours)", date: new Date("2026-02-21T23:00:00Z") },
  ];
  
  for (const testCase of testCases) {
    const config = {      ...campaignConfig,
      timezone: "America/New_York",
      respectContactTimezone: false
    };
    
    const result = isWithinBusinessHours(config, undefined, testCase.date);
    
    console.log(`${testCase.name}: ${result ? "✅ CALLABLE" : "❌ NOT CALLABLE"}`);
  }
  
  process.exit(0);
}

testBusinessHoursLogic();
