import { Router } from "express";
import { calendarService } from "../services/calendar-service";
import { db } from "../db";
import { users, bookingTypes, availabilitySlots, bookings } from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { requireAuth } from "../auth";

const router = Router();

// ================= PUBLIC ROUTES =================

async function resolvePublicBooking(username: string, slug: string) {
  try {
    console.log(`[DEBUG] resolvePublicBooking: Looking for username="${username}", slug="${slug}"`);
    
    const userResults = await db.select().from(users).where(eq(users.username, username));
    const [user] = userResults;
    
    console.log(`[DEBUG] User query result:`, user ? { id: user.id, username: user.username } : "NO USER FOUND");
    
    if (user) {
      const typeResults = await db.select().from(bookingTypes).where(
        and(
          eq(bookingTypes.userId, user.id),
          eq(bookingTypes.slug, slug),
          eq(bookingTypes.isActive, true)
        )
      );
      const [type] = typeResults;
      
      console.log(`[DEBUG] BookingType query result for user:`, type ? { id: type.id, slug: type.slug } : "NO BOOKING TYPE FOR THIS USER");
      
      if (type) {
        return { user, type };
      }
    }

    // Fallback: look up any active booking type by slug
    console.log(`[DEBUG] Trying fallback: looking for any active booking with slug="${slug}"`);
    
    const fallbackResults = await db
      .select({
        user: users,
        type: bookingTypes,
      })
      .from(bookingTypes)
      .leftJoin(users, eq(bookingTypes.userId, users.id))
      .where(and(eq(bookingTypes.slug, slug), eq(bookingTypes.isActive, true)))
      .orderBy(desc(bookingTypes.updatedAt));
    
    const [fallback] = fallbackResults;
    
    console.log(`[DEBUG] Fallback query result:`, fallback ? { userId: fallback.user?.id, typeId: fallback.type?.id } : "NO FALLBACK FOUND");

    if (fallback?.user && fallback?.type) {
      console.log(`[DEBUG] Using fallback result`);
      return { user: fallback.user, type: fallback.type };
    }

    console.log(`[DEBUG] resolvePublicBooking: No booking found after all attempts`);
    return null;
  } catch (error) {
    console.error(`[ERROR] resolvePublicBooking crashed:`, error);
    throw error;
  }
}

// 1. Get User Profile and Booking Type info by Username + Slug
router.get("/public/:username/:slug", async (req, res) => {
  try {
    const { username, slug } = req.params;
    console.log(`[DEBUG] Booking API request: username=${username}, slug=${slug}`);

    const resolved = await resolvePublicBooking(username, slug);
    console.log(`[DEBUG] resolvePublicBooking result:`, resolved ? { userId: resolved.user.id, typeId: resolved.type.id } : null);
    
    if (!resolved) {
      console.warn(`[DEBUG] No booking found for ${username}/${slug}`);
      return res.status(404).json({ message: "Booking type not found or inactive" });
    }

    const { user, type } = resolved;

    res.json({
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        // Don't expose sensitive info
      },
      bookingType: type
    });
  } catch (error) {
    console.error("Error fetching public booking info:", error);
    res.status(500).json({ message: "Internal server error", details: String(error) });
  }
});

// 2. Get Available Slots
router.get("/public/:username/:slug/slots", async (req, res) => {
  try {
    const { username, slug } = req.params;
    const { start, end } = req.query;

    if (!start || !end) return res.status(400).json({ message: "Start and End dates required" });

    const resolved = await resolvePublicBooking(username, slug);
    if (!resolved) return res.status(404).json({ message: "Booking type not found" });
    const { user, type } = resolved;

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    // Call service
    const slots = await calendarService.getAvailability(user.id, type.id, startDate, endDate);
    res.json(slots);

  } catch (error) {
    console.error("Error fetching slots:", error);
    res.status(500).json({ message: "Failed to fetch slots. " + (error as Error).message });
  }
});

// 3. Create Booking
router.post("/public/:username/:slug/book", async (req, res) => {
  try {
    const { username, slug } = req.params;
    const { guestName, guestEmail, guestNotes, startTime } = req.body;

    const resolved = await resolvePublicBooking(username, slug);
    if (!resolved) return res.status(404).json({ message: "Booking type not found" });
    const { user, type } = resolved;

    const booking = await calendarService.createBooking(type.id, {
      name: guestName,
      email: guestEmail,
      notes: guestNotes
    }, startTime);

    res.json(booking);

  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ message: "Booking failed. " + (error as Error).message });
  }
});

// ================= PROTECTED ROUTES (Management) =================

// List my booking types
router.get("/types", requireAuth, async (req, res) => {
  try {
    const myTypes = await db.select().from(bookingTypes).where(eq(bookingTypes.userId, req.user!.userId));
    res.json(myTypes);
  } catch (error) {
    res.status(500).json({ message: "Failed to list booking types" });
  }
});

// List recent bookings (Admin)
router.get("/admin/all", requireAuth, async (req, res) => {
  // Check admin role
  if (req.user!.role !== 'admin' && !req.user!.roles?.includes('admin')) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { filter } = req.query;
  
  try {
    let query = db.select({
      id: bookings.id,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      status: bookings.status,
      meetingUrl: bookings.meetingUrl,
      bookingType: bookingTypes.name,
      hostName: users.username // Simplified
    })
    .from(bookings)
    .leftJoin(bookingTypes, eq(bookings.bookingTypeId, bookingTypes.id))
    .leftJoin(users, eq(bookings.hostUserId, users.id));

    if (filter === 'upcoming') {
      // @ts-ignore
      query.where(gte(bookings.startTime, new Date()));
    } else if (filter === 'past') {
      // @ts-ignore
      query.where(lte(bookings.startTime, new Date()));
    }

    // @ts-ignore
    query.orderBy(desc(bookings.startTime));

    const results = await query;
    res.json(results);
  } catch (error) {
    console.error("Admin bookings error:", error);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

router.post("/types", requireAuth, async (req, res) => {
  try {
    const { name, slug, duration, description } = req.body;
    
    // Check slug uniqueness for user
    const [existing] = await db.select().from(bookingTypes).where(
      and(eq(bookingTypes.userId, req.user!.userId), eq(bookingTypes.slug, slug))
    );
    if (existing) return res.status(409).json({ message: "Slug already exists for this user" });

    const [newType] = await db.insert(bookingTypes).values({
      userId: req.user!.userId,
      name,
      slug,
      duration: duration || 30, // Default 30 min
      description,
    }).returning();

    res.json(newType);
  } catch (error) {
    console.error("Create booking type error:", error);
    res.status(500).json({ message: "Failed to create booking type" });
  }
});

export default router;