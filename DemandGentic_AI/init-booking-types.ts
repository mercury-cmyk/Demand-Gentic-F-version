import { db } from "./server/db";
import { bookingTypes, users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Initializing booking types...");
  
  // Find admin user
  const [admin] = await db.select().from(users).where(eq(users.username, "admin"));
  
  if (!admin) {
    console.error("Admin user not found. Please create 'admin' user first.");
    process.exit(1);
  }
  
  const typesToCreate = [
    {
      name: "Product Demo",
      slug: "demo",
      duration: 30,
      description: "A 30-minute walkthrough of the DemandGentic.ai platform."
    },
    {
      name: "Strategy Call",
      slug: "strategy",
      duration: 45,
      description: "Deep dive into your B2B demand generation strategy."
    }
  ];

  for (const t of typesToCreate) {
    const [existing] = await db.select().from(bookingTypes).where(
      eq(bookingTypes.slug, t.slug)
    );
    
    if (!existing) {
      await db.insert(bookingTypes).values({
        userId: admin.id,
        name: t.name,
        slug: t.slug,
        duration: t.duration,
        description: t.description,
        isActive: true
      });
      console.log(`Created booking type: ${t.name} (${t.slug})`);
    } else {
        console.log(`Booking type exists: ${t.name}`);
    }
  }
  
  console.log("Done.");
  process.exit(0);
}

main().catch(console.error);