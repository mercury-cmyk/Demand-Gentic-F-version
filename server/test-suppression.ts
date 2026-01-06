import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  getSuppressionReason,
  checkSuppressionBulk,
  addToSuppressionList,
  removeFromSuppressionList,
  normalizeText,
  computeNameCompanyHash,
} from "./lib/suppression.service";

async function testSuppressionLogic() {
  console.log("🧪 Testing Suppression Logic\n");

  console.log("📋 Step 1: Clean up any existing test data");
  await db.execute(sql`DELETE FROM suppression_list WHERE source = 'test'`);
  await db.execute(sql`DELETE FROM contacts WHERE email LIKE '%@test-suppression.com'`);

  console.log("\n📋 Step 2: Add test suppression entries");
  await addToSuppressionList([
    {
      email: "john.doe@example.com",
      reason: "Test - Email Match",
      source: "test",
    },
    {
      cavId: "CAV-12345",
      reason: "Test - CAV ID Match",
      source: "test",
    },
    {
      cavUserId: "USER-67890",
      reason: "Test - CAV User ID Match",
      source: "test",
    },
    {
      fullName: "Jane Smith",
      companyName: "Acme Corp",
      reason: "Test - Full Name + Company Match",
      source: "test",
    },
  ]);
  console.log("✅ Added 4 test suppression entries");

  console.log("\n📋 Step 3: Create test contacts");
  
  const testContacts = [
    {
      id: crypto.randomUUID(),
      email: "john.doe@example.com",
      firstName: "John",
      lastName: "Doe",
      fullNameNorm: "john doe",
      companyNorm: "some company",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: null,
      expectedMatch: true,
      expectedReason: "Email",
    },
    {
      id: crypto.randomUUID(),
      email: "JOHN.DOE@EXAMPLE.COM",
      firstName: "John",
      lastName: "Doe",
      fullNameNorm: "john doe",
      companyNorm: "some company",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: null,
      expectedMatch: true,
      expectedReason: "Email (case-insensitive)",
    },
    {
      id: crypto.randomUUID(),
      email: "different@test.com",
      firstName: "Test",
      lastName: "User",
      fullNameNorm: "test user",
      companyNorm: "test company",
      nameCompanyHash: null,
      cavId: "CAV-12345",
      cavUserId: null,
      expectedMatch: true,
      expectedReason: "CAV ID",
    },
    {
      id: crypto.randomUUID(),
      email: "another@test.com",
      firstName: "Another",
      lastName: "Person",
      fullNameNorm: "another person",
      companyNorm: "test company",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: "USER-67890",
      expectedMatch: true,
      expectedReason: "CAV User ID",
    },
    {
      id: crypto.randomUUID(),
      email: "jane@test-suppression.com",
      firstName: "Jane",
      lastName: "Smith",
      fullNameNorm: "jane smith",
      companyNorm: "acme corp",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: null,
      expectedMatch: true,
      expectedReason: "Full Name + Company",
    },
    {
      id: crypto.randomUUID(),
      email: "partial@test-suppression.com",
      firstName: "Jane",
      lastName: "Doe",
      fullNameNorm: "jane doe",
      companyNorm: "different company",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: null,
      expectedMatch: false,
      expectedReason: "Should NOT match (name only, wrong company)",
    },
    {
      id: crypto.randomUUID(),
      email: "partial2@test-suppression.com",
      firstName: "John",
      lastName: "Smith",
      fullNameNorm: "john smith",
      companyNorm: "acme corp",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: null,
      expectedMatch: false,
      expectedReason: "Should NOT match (wrong name, company only)",
    },
    {
      id: crypto.randomUUID(),
      email: "clean@test-suppression.com",
      firstName: "Clean",
      lastName: "User",
      fullNameNorm: "clean user",
      companyNorm: "clean company",
      nameCompanyHash: null,
      cavId: null,
      cavUserId: null,
      expectedMatch: false,
      expectedReason: "Should NOT match (no matching criteria)",
    },
  ];

  for (const contact of testContacts) {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    const fullNameNorm = normalizeText(fullName);
    const companyNorm = normalizeText(contact.companyNorm); // already normalized in test data
    const nameCompanyHash = computeNameCompanyHash(fullNameNorm, companyNorm);
    
    await db.execute(sql`
      INSERT INTO contacts (
        id, email, full_name, first_name, last_name, 
        full_name_norm, company_norm, name_company_hash,
        cav_id, cav_user_id
      ) VALUES (
        ${contact.id}, ${contact.email}, ${fullName}, ${contact.firstName}, ${contact.lastName},
        ${fullNameNorm}, ${companyNorm}, ${nameCompanyHash},
        ${contact.cavId}, ${contact.cavUserId}
      )
    `);
  }
  console.log(`✅ Created ${testContacts.length} test contacts`);

  console.log("\n📋 Step 4: Test suppression checking");
  let passedTests = 0;
  let failedTests = 0;

  for (const contact of testContacts) {
    const reason = await getSuppressionReason(contact.id);
    const isMatched = reason !== null;

    const testPassed = isMatched === contact.expectedMatch;
    
    if (testPassed) {
      console.log(`✅ PASS: ${contact.expectedReason}`);
      console.log(`   Contact: ${contact.email}`);
      console.log(`   Expected: ${contact.expectedMatch ? 'Suppressed' : 'Not Suppressed'}`);
      console.log(`   Actual: ${isMatched ? `Suppressed (${reason})` : 'Not Suppressed'}`);
      passedTests++;
    } else {
      console.log(`❌ FAIL: ${contact.expectedReason}`);
      console.log(`   Contact: ${contact.email}`);
      console.log(`   Expected: ${contact.expectedMatch ? 'Suppressed' : 'Not Suppressed'}`);
      console.log(`   Actual: ${isMatched ? `Suppressed (${reason})` : 'Not Suppressed'}`);
      failedTests++;
    }
    console.log("");
  }

  console.log("\n📋 Step 5: Test bulk suppression checking");
  const contactIds = testContacts.map(c => c.id);
  const bulkResults = await checkSuppressionBulk(contactIds);
  console.log(`✅ Bulk check processed ${contactIds.length} contacts`);
  console.log(`   Suppressed: ${bulkResults.size}`);
  console.log(`   Not Suppressed: ${contactIds.length - bulkResults.size}`);

  console.log("\n📋 Step 6: Clean up test data");
  await db.execute(sql`DELETE FROM suppression_list WHERE source = 'test'`);
  await db.execute(sql`DELETE FROM contacts WHERE email LIKE '%@test-suppression.com'`);
  console.log("✅ Test data cleaned up");

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log("=".repeat(50) + "\n");

  if (failedTests === 0) {
    console.log("🎉 All tests passed! Suppression logic is working correctly.");
  } else {
    console.log("⚠️  Some tests failed. Please review the suppression logic.");
  }

  process.exit(failedTests === 0 ? 0 : 1);
}

testSuppressionLogic().catch(err => {
  console.error("❌ Error running tests:", err);
  process.exit(1);
});
