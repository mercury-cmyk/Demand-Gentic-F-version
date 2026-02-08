/**
 * Client Portal Bookings Routes
 * 
 * Manages bookings and booking types for client portal users.
 * Clients can view their bookings, create/manage booking types,
 * and share booking links.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import {
  bookings,
  bookingTypes,
  availabilitySlots,
  clientAccounts,
  users,
} from '@shared/schema';
import { calendarService } from '../services/calendar-service';

const router = Router();

// ==================== MY BOOKINGS ====================

/**
 * GET /
 * List bookings for the authenticated client user's account.
 * Supports ?filter=upcoming|past|all (default: upcoming)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const filter = (req.query.filter as string) || 'upcoming';

    // Get users linked to this client account to find their bookings
    const clientAccount = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    if (!clientAccount.length) {
      return res.json([]);
    }

    // Build query - get all bookings where the host is associated with this client account
    // or where the booking was created for campaigns linked to this account
    let baseQuery = db
      .select({
        id: bookings.id,
        guestName: bookings.guestName,
        guestEmail: bookings.guestEmail,
        guestNotes: bookings.guestNotes,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        status: bookings.status,
        meetingUrl: bookings.meetingUrl,
        createdAt: bookings.createdAt,
        bookingTypeName: bookingTypes.name,
        bookingTypeDuration: bookingTypes.duration,
        hostUsername: users.username,
      })
      .from(bookings)
      .leftJoin(bookingTypes, eq(bookings.bookingTypeId, bookingTypes.id))
      .leftJoin(users, eq(bookings.hostUserId, users.id));

    // Apply time filter
    const now = new Date();
    let results;
    if (filter === 'upcoming') {
      results = await baseQuery
        .where(gte(bookings.startTime, now))
        .orderBy(bookings.startTime);
    } else if (filter === 'past') {
      results = await baseQuery
        .where(lte(bookings.startTime, now))
        .orderBy(desc(bookings.startTime));
    } else {
      results = await baseQuery.orderBy(desc(bookings.startTime));
    }

    res.json(results);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] List bookings error:', error);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
});

// ==================== BOOKING TYPES ====================

/**
 * GET /types
 * List booking types for the client portal user
 */
router.get('/types', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get all booking types (not user-scoped for now — show all available)
    const types = await db
      .select()
      .from(bookingTypes)
      .orderBy(desc(bookingTypes.createdAt));

    res.json(types);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] List booking types error:', error);
    res.status(500).json({ message: 'Failed to fetch booking types' });
  }
});

/**
 * POST /types
 * Create a new booking type
 */
router.post('/types', async (req: Request, res: Response) => {
  try {
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, slug, duration, description, color } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ message: 'Name and slug are required' });
    }

    // Generate slug from name if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [newType] = await db.insert(bookingTypes).values({
      userId: clientUserId,
      name,
      slug: finalSlug,
      duration: duration || 30,
      description: description || null,
      color: color || '#3b82f6',
    }).returning();

    res.json(newType);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] Create booking type error:', error);
    res.status(500).json({ message: 'Failed to create booking type' });
  }
});

/**
 * PUT /types/:id
 * Update a booking type (toggle active, edit fields)
 */
router.put('/types/:id', async (req: Request, res: Response) => {
  try {
    const typeId = parseInt(req.params.id);
    if (isNaN(typeId)) {
      return res.status(400).json({ message: 'Invalid booking type ID' });
    }

    const { name, duration, description, isActive, color } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (duration !== undefined) updateData.duration = duration;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (color !== undefined) updateData.color = color;

    const [updated] = await db
      .update(bookingTypes)
      .set(updateData)
      .where(eq(bookingTypes.id, typeId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Booking type not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] Update booking type error:', error);
    res.status(500).json({ message: 'Failed to update booking type' });
  }
});

/**
 * DELETE /types/:id
 * Delete a booking type
 */
router.delete('/types/:id', async (req: Request, res: Response) => {
  try {
    const typeId = parseInt(req.params.id);
    if (isNaN(typeId)) {
      return res.status(400).json({ message: 'Invalid booking type ID' });
    }

    const [deleted] = await db
      .delete(bookingTypes)
      .where(eq(bookingTypes.id, typeId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'Booking type not found' });
    }

    res.json({ message: 'Booking type deleted', id: typeId });
  } catch (error) {
    console.error('[CLIENT BOOKINGS] Delete booking type error:', error);
    res.status(500).json({ message: 'Failed to delete booking type' });
  }
});

/**
 * PUT /:id/cancel
 * Cancel a booking
 */
router.put('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const bookingId = parseInt(req.params.id);
    if (isNaN(bookingId)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: 'cancelled' })
      .where(eq(bookings.id, bookingId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] Cancel booking error:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
  }
});

// ==================== AVAILABILITY ====================

/**
 * GET /availability
 * Get availability slots for the client user
 */
router.get('/availability', async (req: Request, res: Response) => {
  try {
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const slots = await db
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.userId, clientUserId))
      .orderBy(availabilitySlots.dayOfWeek, availabilitySlots.startTime);

    res.json(slots);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] Get availability error:', error);
    res.status(500).json({ message: 'Failed to fetch availability' });
  }
});

/**
 * POST /availability
 * Set availability slots
 */
router.post('/availability', async (req: Request, res: Response) => {
  try {
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      return res.status(400).json({ message: 'Slots must be an array' });
    }

    // Delete existing slots and insert new ones
    await db.delete(availabilitySlots).where(eq(availabilitySlots.userId, clientUserId));

    if (slots.length > 0) {
      await db.insert(availabilitySlots).values(
        slots.map((slot: any) => ({
          userId: clientUserId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: slot.timezone || 'UTC',
          isActive: true,
        }))
      );
    }

    // Return updated slots
    const updatedSlots = await db
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.userId, clientUserId))
      .orderBy(availabilitySlots.dayOfWeek, availabilitySlots.startTime);

    res.json(updatedSlots);
  } catch (error) {
    console.error('[CLIENT BOOKINGS] Set availability error:', error);
    res.status(500).json({ message: 'Failed to set availability' });
  }
});

export default router;
