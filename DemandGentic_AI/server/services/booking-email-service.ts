/**
 * Booking Email Service
 * 
 * Handles sending booking confirmation emails with iCalendar (.ics) attachments
 * using Mercury SMTP email service.
 */

import { mercuryEmailService } from './mercury/email-service';

interface BookingEmailData {
  guestName: string;
  guestEmail: string;
  hostName: string;
  hostEmail?: string;
  bookingTypeName: string;
  bookingDescription?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  timezone?: string;
  meetingUrl?: string;
  notes?: string;
}

/**
 * Generate iCalendar (ICS) file content for a booking
 * This allows guests to import the meeting into any calendar app
 */
export function generateICalendarContent(data: BookingEmailData): string {
  const { 
    guestName, 
    guestEmail, 
    hostName, 
    hostEmail,
    bookingTypeName,
    bookingDescription,
    startTime,
    endTime,
    timezone = 'UTC',
    meetingUrl,
    notes
  } = data;

  // Format dates in iCalendar format (YYYYMMDDTHHMMSSZ)
  const formatICalDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  const startISO = formatICalDate(startTime);
  const endISO = formatICalDate(endTime);
  const createdISO = formatICalDate(new Date());

  // Build description with optional meeting URL
  let description = `${bookingTypeName}\n\nGuest: ${guestName} (${guestEmail})`;
  if (bookingDescription) {
    description += `\n\nDescription:\n${bookingDescription}`;
  }
  if (meetingUrl) {
    description += `\n\nMeeting Link: ${meetingUrl}`;
  }
  if (notes) {
    description += `\n\nNotes:\n${notes}`;
  }

  // Escape iCal special characters
  const escapeICalText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');
  };

  const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DemandGentic//Booking Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeICalText(bookingTypeName)}
X-WR-TIMEZONE:${timezone}
BEGIN:VEVENT
UID:booking-${Date.now()}@demandgentic.ai
DTSTAMP:${createdISO}
DTSTART:${startISO}
DTEND:${endISO}
SUMMARY:${escapeICalText(bookingTypeName)}
DESCRIPTION:${escapeICalText(description)}
LOCATION:${meetingUrl ? 'Online' : 'TBD'}
ORGANIZER;CN=${escapeICalText(hostName)}${hostEmail ? `;EMAIL=${hostEmail}` : ''}
ATTENDEE;CN=${escapeICalText(guestName)};RSVP=TRUE:mailto:${guestEmail}
STATUS:CONFIRMED
SEQUENCE:0
${meetingUrl ? `URL:${meetingUrl}\n` : ''}END:VEVENT
END:VCALENDAR`;

  return icalContent;
}

/**
 * Generate HTML email template for booking confirmation
 */
export function generateBookingConfirmationHtml(data: BookingEmailData): string {
  const {
    guestName,
    hostName,
    bookingTypeName,
    bookingDescription,
    startTime,
    endTime,
    timezone,
    meetingUrl,
    notes
  } = data;

  const formatDateTime = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'UTC'
    });
  };

  const startStr = formatDateTime(startTime);
  const endStr = endTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone || 'UTC'
  });

  return `



  
  
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; }
    .section { margin-bottom: 20px; }
    .section-title { font-weight: 600; color: #667eea; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
    .detail { padding: 12px; background: white; border-left: 4px solid #667eea; margin-bottom: 10px; }
    .detail-label { font-weight: 600; color: #667eea; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; margin-top: 10px; }
    .button:hover { background: #764ba2; }
    .footer { font-size: 12px; color: #999; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; }
    .ical-hint { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 13px; }
  


  
    
      ✓ Booking Confirmed
      Your ${bookingTypeName} has been scheduled
    

    
      
        📅 Calendar file attached: You can import the attached .ics file directly into your calendar (Google Calendar, Outlook, Apple Calendar, etc.)
      

      
        Meeting Details
        
          Event
          ${bookingTypeName}
        
        
          Date & Time
          ${startStr} – ${endStr}
          Timezone: ${timezone || 'UTC'}
        
        
          Host
          ${hostName}
        
        ${meetingUrl ? `
        
          Meeting Link
          ${meetingUrl}
        
        ` : ''}
      

      ${bookingDescription ? `
      
        About This Meeting
        
          ${bookingDescription.replace(/\n/g, '')}
        
      
      ` : ''}

      ${notes ? `
      
        Additional Notes
        
          ${notes.replace(/\n/g, '')}
        
      
      ` : ''}

      
        How To Add To Your Calendar
        
          Option 1 (Recommended): Look for the .ics file attachment below and click to import.
          Option 2: Copy the meeting details and manually add to your calendar.
          Option 3: Click the meeting link below to join (if provided).
        
      

      ${meetingUrl ? `
      
        Join Meeting
      
      ` : ''}

      
        This booking was created by DemandGentic. If you need to reschedule or have questions, please contact ${hostName}.
      
    
  


  `.trim();
}

/**
 * Send booking confirmation email with iCalendar attachment via Mercury SMTP
 */
export async function sendBookingConfirmationEmail(data: BookingEmailData): Promise {
  try {
    const icsContent = generateICalendarContent(data);
    const htmlContent = generateBookingConfirmationHtml(data);

    const guestResult = await mercuryEmailService.sendDirect({
      to: data.guestEmail,
      toName: data.guestName,
      subject: `Booking Confirmed: ${data.bookingTypeName} with ${data.hostName}`,
      html: htmlContent,
      replyTo: data.hostEmail,
      attachments: [
        {
          filename: 'booking.ics',
          content: icsContent,
          contentType: 'text/calendar; charset=utf-8',
        },
      ],
    });

    if (!guestResult.success) {
      console.error(`[Booking Email] Mercury send failed for ${data.guestEmail}:`, guestResult.error);
      return false;
    }

    console.log(`[Booking Email] Confirmation sent to ${data.guestEmail}, messageId: ${guestResult.messageId}`);

    // Also send a copy to host if email provided
    if (data.hostEmail && data.hostEmail !== data.guestEmail) {
      try {
        const hostResult = await mercuryEmailService.sendDirect({
          to: data.hostEmail,
          subject: `Booking Accepted: ${data.guestName} - ${data.bookingTypeName}`,
          html: generateHostBookingNotificationHtml(data),
        });

        if (!hostResult.success) {
          console.error(`[Booking Email] Mercury host notification failed for ${data.hostEmail}:`, hostResult.error);
        } else {
          console.log(`[Booking Email] Host notification sent to ${data.hostEmail}, messageId: ${hostResult.messageId}`);
        }
      } catch (error) {
        console.error(`[Booking Email] Failed to send host notification:`, error);
      }
    }

    return true;
  } catch (error) {
    console.error('[Booking Email] Failed to send confirmation:', error);
    return false;
  }
}

/**
 * Generate HTML email for host notification
 */
function generateHostBookingNotificationHtml(data: BookingEmailData): string {
  const {
    guestName,
    guestEmail,
    bookingTypeName,
    startTime,
    endTime,
    timezone,
    meetingUrl
  } = data;

  const formatDateTime = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'UTC'
    });
  };

  return `



  
  
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; }
    .detail { padding: 12px; background: white; border-left: 4px solid #667eea; margin-bottom: 10px; }
    .detail-label { font-weight: 600; color: #667eea; }
  


  
    
      New Booking
      ${guestName} has scheduled ${bookingTypeName}
    

    
      
        Guest
        ${guestName} (${guestEmail})
      
      
        Meeting Type
        ${bookingTypeName}
      
      
        Date & Time
        ${formatDateTime(startTime)} – ${endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone || 'UTC' })}
      
      ${meetingUrl ? `
      
        Meeting Link
        ${meetingUrl}
      
      ` : ''}
    
  


  `.trim();
}

export const bookingEmailService = {
  sendConfirmationEmail: sendBookingConfirmationEmail,
  generateICalendar: generateICalendarContent,
  generateConfirmationHtml: generateBookingConfirmationHtml,
};