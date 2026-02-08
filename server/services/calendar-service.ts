import { google } from 'googleapis';
import { db } from '../db';
import { users, bookings, availabilitySlots, bookingTypes } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import CryptoJS from 'crypto-js';
import { storage } from '../storage';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.APP_BASE_URL || 'https://demandgentic.ai'}/api/oauth/google/callback`;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.MAILBOX_ENCRYPTION_KEY || "default-encryption-key-change-in-production";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn("Missing Google OAuth credentials. Calendar service may not work.");
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Helper to decrypt tokens
function decryptToken(encryptedToken: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Failed to decrypt token:", error);
    throw new Error("Token decryption failed");
  }
}

async function getAuthenticatedClient(userId: string) {
  // Try to find connected Google account in mailbox_accounts
  const mailbox = await storage.getMailboxAccount(userId, 'google');
  
  if (!mailbox || !mailbox.accessToken || !mailbox.refreshToken) {
    throw new Error("User has not connected Google Calendar/Gmail.");
  }

  const accessToken = decryptToken(mailbox.accessToken);
  const refreshToken = decryptToken(mailbox.refreshToken);

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    // If we had expiry date, we could set it, but verify if googleapis handles auto-refresh with refresh_token alone?
    // Usually yes, assuming handleRefreshToken is not needed manually if we pass refresh_token
  });

  return oauth2Client;
}

export class CalendarService {

  /**
   * Create a new booking for a user
   */
  async createBooking(bookingTypeId: number, guest: { name: string, email: string, notes?: string }, startTime: string, callDetails?: { callId: string, campaignId: number, leadId: number }) {
    const [type] = await db.select().from(bookingTypes).where(eq(bookingTypes.id, bookingTypeId));
    if (!type) throw new Error("Booking type not found");
    if (!type.userId) throw new Error("Booking type has no assigned user");

    const hostUserId = type.userId as string;
    const client = await getAuthenticatedClient(hostUserId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const startDate = new Date(startTime);
    const endDate = new Date(startDate.getTime() + type.duration * 60000);

    const event = {
      summary: `${type.name} with ${guest.name}`,
      description: `Guest: ${guest.name} (${guest.email})\n\nNotes:\n${guest.notes || 'N/A'}`,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'UTC', // Always store in UTC
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'UTC',
      },
      attendees: [
        { email: guest.email },
        // Add host email later
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
      conferenceData: {
        createRequest: {
          requestId: `dg-meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };

    // Get host email
    const [host] = await db.select({ email: users.email }).from(users).where(eq(users.id, hostUserId));
    if (host?.email) {
      event.attendees.push({ email: host.email });
    }

    const createdEvent = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
    });

    const [newBooking] = await db.insert(bookings).values({
      bookingTypeId: type.id,
      hostUserId: hostUserId,
      guestName: guest.name,
      guestEmail: guest.email,
      guestNotes: guest.notes || (callDetails ? `Call ID: ${callDetails.callId}, Campaign: ${callDetails.campaignId}` : undefined),
      startTime: startDate,
      endTime: endDate,
      status: 'confirmed',
      meetingUrl: createdEvent.data.hangoutLink || undefined,
      googleEventId: createdEvent.data.id || undefined,
    }).returning();

    return newBooking;
  }
  
  /**
   * List available slots for a User and Booking Type
   */
  async getAvailability(userId: string, bookingTypeId: number, startDate: Date, endDate: Date) {
    const client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    // 1. Get Booking Type Duration
    const [bookingType] = await db.select().from(bookingTypes).where(eq(bookingTypes.id, bookingTypeId));
    if (!bookingType) throw new Error("Booking type not found");
    const durationMin = bookingType.duration;

    // 2. Get User's Availability Slots (from DB)
    // If no slots defined, assume 9-5 Mon-Fri UTC as fallback? Or just return empty?
    // Let's query slots.
    const userSlots = await db.select().from(availabilitySlots).where(
      and(
        eq(availabilitySlots.userId, userId),
        eq(availabilitySlots.isActive, true)
      )
    );

    // If no specific slots configuration, default to Mon-Fri 09:00-17:00 UTC
    // Logic: Map slots to the requested date range.

    // 3. Get Google Calendar Busy Times
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busyRanges = freeBusy.data.calendars?.['primary']?.busy || [];

    // 4. Calculate free slots logic
    // This is a simplified implementation. Real-world needs robust time handling.
    const slots: { start: string; end: string }[] = [];
    
    // Iterate through each day in range
    let currentDay = new Date(startDate);
    while (currentDay <= endDate) {
       const dayOfWeek = currentDay.getUTCDay(); // 0-6
       
       // Find slots for this weekday
       // Fallback: 9-5 M-F if no slots config
       let validTimeRanges: {start: Date, end: Date}[] = [];
       
       if (userSlots.length === 0) {
         if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            const start = new Date(currentDay);
            start.setUTCHours(9, 0, 0, 0);
            const end = new Date(currentDay);
            end.setUTCHours(17, 0, 0, 0);
            validTimeRanges.push({ start, end });
         }
       } else {
         const daySlots = userSlots.filter(s => s.dayOfWeek === dayOfWeek);
         for (const s of daySlots) {
            const [sh, sm] = s.startTime.split(':').map(Number);
            const [eh, em] = s.endTime.split(':').map(Number);
            const start = new Date(currentDay);
            start.setUTCHours(sh, sm, 0, 0);
            const end = new Date(currentDay);
            end.setUTCHours(eh, em, 0, 0);
            validTimeRanges.push({ start, end });
         }
       }

       // For each valid range, check against busy ranges
       for (const range of validTimeRanges) {
          let cursor = new Date(range.start);
          while (cursor.getTime() + durationMin * 60000 <= range.end.getTime()) {
             const slotEnd = new Date(cursor.getTime() + durationMin * 60000);
             
             // Check collision with Google Busy
             const isBusy = busyRanges.some(busy => {
                if (!busy.start || !busy.end) return false;
                const bStart = new Date(busy.start).getTime();
                const bEnd = new Date(busy.end).getTime();
                const sStart = cursor.getTime();
                const sEnd = slotEnd.getTime();
                return (sStart < bEnd && sEnd > bStart); // Overlap
             });

             if (!isBusy) {
                slots.push({
                   start: cursor.toISOString(),
                   end: slotEnd.toISOString()
                });
             }
             
             // Step forward (e.g. 15 min or duration?)
             // Usually start times are every 15 or 30 mins.
             // Let's use 30 min step or duration if smaller.
             cursor = new Date(cursor.getTime() + 30 * 60000); 
          }
       }

       currentDay.setDate(currentDay.getDate() + 1);
       currentDay.setHours(0,0,0,0);
    }

    return slots;
  }
}

export const calendarService = new CalendarService();
