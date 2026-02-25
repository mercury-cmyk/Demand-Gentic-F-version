import { Request, Response } from 'express';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';

export const livekitWebhookHandler = async (req: Request, res: Response) => {
  // Use specific webhook secret if available, otherwise fall back to API secret
  // LiveKit signs webhooks with your API Secret by default, unless a specific key is generated
  const API_SECRET = process.env.LIVEKIT_WEBHOOK_SECRET || process.env.LIVEKIT_API_SECRET;
  const API_KEY = process.env.LIVEKIT_API_KEY;

  if (!API_SECRET || !API_KEY) {
    console.error('[LiveKit Webhook] Missing API Key or Secret configuration');
    return res.status(500).send('Server Configuration Error');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn('[LiveKit Webhook] Missing Authorization header');
    return res.status(401).send('Unauthorized');
  }

  try {
    // LiveKit sends the JWT directly in the Authorization header
    const token = authHeader;

    // Verify the JWT signature
    const decoded = jwt.verify(token, API_SECRET, { algorithms: ['HS256'] }) as any;

    // Verify payload hash (sha256 claim) ensures body hasn't been tampered with
    if (decoded.sha256) {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.warn('[LiveKit Webhook] Raw body not captured for signature verification');
        return res.status(500).send('Internal Server Error');
      }

      // LiveKit uses base64 encoded sha256 hash of the raw body
      const hash = createHash('sha256').update(rawBody).digest('base64');
      if (decoded.sha256 !== hash) {
        console.warn('[LiveKit Webhook] Body hash mismatch');
        return res.status(401).send('Invalid Signature');
      }
    }

    const event = req.body;
    console.log(`[LiveKit Webhook] Received event: ${event.event} (Room: ${event.room?.name || 'N/A'})`);

    // Handle specific events
    if (event.event === 'room_finished') {
        console.log(`[LiveKit Webhook] Room finished: ${event.room?.name}, Duration: ${event.room?.duration}s`);
        // Here you could trigger post-call analysis or database updates
    } else if (event.event === 'participant_joined') {
        console.log(`[LiveKit Webhook] Participant joined: ${event.participant?.identity}`);
    }

    // Respond 200 OK to acknowledge receipt
    res.status(200).send('ok');
  } catch (err) {
    console.error('[LiveKit Webhook] Verification failed:', err);
    res.status(401).send('Unauthorized');
  }
};