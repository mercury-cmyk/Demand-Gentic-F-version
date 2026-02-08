import { Router } from "express";
import { calendarService } from "../services/calendar-service";
import { db } from "../db";
import { users, bookingTypes, availabilitySlots, bookings } from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { requireAuth } from "../auth";

const router = Router();

// ================= PUBLIC ROUTES =================

// 1. Get User Profile and Booking Type info by Username + Slug
router.get("/public/:username/:slug", async (req, res) => {
  try {
    const { username, slug } = req.params;

    // Find User
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) return res.status(404).json({ message: "User not found" });

    // Find Booking Type
    const [type] = await db.select().from(bookingTypes).where(
      and(
        eq(bookingTypes.userId, user.id),
        eq(bookingTypes.slug, slug),
        eq(bookingTypes.isActive, true)
      )
    );

    if (!type) return res.status(404).json({ message: "Booking type not found or inactive" });

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
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. Get Available Slots
router.get("/public/:username/:slug/slots", async (req, res) => {
  try {
    const { username, slug } = req.params;
    const { start, end } = req.query;

    if (!start || !end) return res.status(400).json({ message: "Start and End dates required" });

    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) return res.status(404).json({ message: "User not found" });

    const [type] = await db.select().from(bookingTypes).where(
      and(
        eq(bookingTypes.userId, user.id),
        eq(bookingTypes.slug, slug)
      )
    );
    if (!type) return res.status(404).json({ message: "Booking type not found" });

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

    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) return res.status(404).json({ message: "User not found" });

    const [type] = await db.select().from(bookingTypes).where(
      and(
        eq(bookingTypes.userId, user.id),
        eq(bookingTypes.slug, slug)
      )
    );
    if (!type) return res.status(404).json({ message: "Booking type not found" });

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
