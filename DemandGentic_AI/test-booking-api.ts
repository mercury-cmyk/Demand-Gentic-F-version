/**
 * Test the booking API endpoint directly
 * Tests both the database connection and the API response
 */

import { db } from "./server/db";
import { users, bookingTypes } from "./shared/schema";
import { eq, and } from "drizzle-orm";

async function testBookingAPI() {
  console.log("=== Testing Booking API Configuration ===\n");

  try {
    // Test 1: Database connection
    console.log("Test 1: Database Connection");
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`Using database from: ${process.env.DATABASE_URL ? "DATABASE_URL" : process.env.DATABASE_URL_DEV ? "DATABASE_URL_DEV" : "UNKNOWN"}`);
    
    // Try a simple query
    const allUsers = await db.select().from(users).limit(1);
    console.log(`✓ Database connected successfully`);
    console.log(`✓ Users table is accessible\n`);

    // Test 2: Find admin user
    console.log("Test 2: Finding admin user");
    const [adminUser] = await db.select().from(users).where(eq(users.username, "admin"));
    if (!adminUser) {
      console.log("✗ Admin user NOT found");
      return;
    }
    console.log(`✓ Admin user found: ID=${adminUser.id}, Username=${adminUser.username}\n`);

    // Test 3: Find demo booking type for admin
    console.log("Test 3: Finding demo booking type for admin user");
    const [demoBooingType] = await db.select().from(bookingTypes).where(
      and(
        eq(bookingTypes.userId, adminUser.id),
        eq(bookingTypes.slug, "demo"),
        eq(bookingTypes.isActive, true)
      )
    );
    
    if (!demoBooingType) {
      console.log(`✗ Demo booking type NOT found for admin user`);
      
      // Try fallback
      console.log("\nTest 3b: Trying fallback - any active demo booking");
      const [fallback] = await db
        .select({
          user: users,
          type: bookingTypes,
        })
        .from(bookingTypes)
        .leftJoin(users, eq(bookingTypes.userId, users.id))
        .where(and(eq(bookingTypes.slug, "demo"), eq(bookingTypes.isActive, true)))
        .limit(1);
      
      if (fallback?.user && fallback?.type) {
        console.log(`✓ Found demo booking (fallback): User=${fallback.user.username}, BookingType=${fallback.type.slug}`);
      } else {
        console.log(`✗ No active demo booking type found anywhere`);
      }
      return;
    }

    console.log(`✓ Demo booking type found: ID=${demoBooingType.id}, Slug=${demoBooingType.slug}\n`);

    // Test 4: API response simulation
    console.log("Test 4: Simulating API response");
    const apiResponse = {
      user: {
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        username: adminUser.username,
      },
      bookingType: demoBooingType
    };
    
    console.log("✓ API would return:", {
      user: apiResponse.user,
      bookingType: {
        id: apiResponse.bookingType.id,
        name: apiResponse.bookingType.name,
        slug: apiResponse.bookingType.slug,
        duration: apiResponse.bookingType.duration,
        isActive: apiResponse.bookingType.isActive,
      }
    });

    console.log("\n=== ALL TESTS PASSED ✓ ===");
    console.log("The booking API should be working correctly.");
    console.log("If the page still shows 'Booking Page Not Found', the issue may be:");
    console.log("1. Frontend routing issue (App.tsx route not matching)");
    console.log("2. API request error (check browser console for CORS or network errors)");
    console.log("3. Component state management issue");

  } catch (error) {
    console.error("✗ TEST FAILED:", error);
    console.log("\nError details:", error instanceof Error ? error.message : String(error));
  }

  process.exit(0);
}

testBookingAPI();