import { Router, Request, Response } from 'express';
import { emailTrackingService } from '../lib/email-tracking-service';
import { requireAuth } from '../auth';
import { emitEmailEngagementSignal } from '../lib/email-pipeline-bridge';

const router = Router();

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Tracking pixel endpoint - records email opens
 * GET /api/track/open/:token.png
 */
router.get('/open/:token', async (req: Request, res: Response) => {
  try {
    // Remove .png extension if present
    const token = req.params.token.replace('.png', '');
    
    // Decode tracking token
    const decoded = emailTrackingService.decodeTrackingToken(token);
    
    if (decoded) {
      // Extract metadata from request
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || undefined;
      const userAgent = req.headers['user-agent'] || undefined;
      
      // Simple device type detection
      const ua = userAgent?.toLowerCase() || '';
      let deviceType = 'desktop';
      if (ua.includes('mobile')) deviceType = 'mobile';
      else if (ua.includes('tablet') || ua.includes('ipad')) deviceType = 'tablet';
      
      // Record the open (async, don't wait)
      emailTrackingService.recordEmailOpen(
        decoded.messageId,
        decoded.recipientEmail,
        {
          ipAddress,
          userAgent,
          deviceType,
        }
      ).catch(err => console.error('[TRACKING-OPEN] Error:', err));

      // Emit pipeline engagement signal (async, fire-and-forget)
      emitEmailEngagementSignal('email_opened', decoded.messageId, decoded.recipientEmail)
        .catch(err => console.warn('[TRACKING-OPEN] Pipeline signal failed:', err));
    }
    
    // Always return tracking pixel (even if tracking fails)
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(TRACKING_PIXEL);
  } catch (error) {
    console.error('[TRACKING-OPEN] Error processing open tracking:', error);
    // Still return pixel even on error
    res.setHeader('Content-Type', 'image/png');
    res.send(TRACKING_PIXEL);
  }
});

/**
 * Link click tracking endpoint - records clicks and redirects
 * GET /api/track/click/:token
 */
router.get('/click/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    
    // Decode and verify link tracking token (checks HMAC signature)
    const decoded = emailTrackingService.decodeLinkTrackingToken(token);
    
    if (!decoded) {
      console.warn('[TRACKING-CLICK] Invalid or tampered token');
      return res.status(400).send('Invalid tracking token');
    }
    
    // Validate URL is safe for redirect (prevent open redirect attacks)
    if (!emailTrackingService.isUrlSafeForRedirect(decoded.originalUrl)) {
      console.error('[TRACKING-CLICK] Unsafe redirect URL blocked:', decoded.originalUrl);
      return res.status(400).send('Invalid redirect URL');
    }
    
    // Extract metadata from request
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || undefined;
    const userAgent = req.headers['user-agent'] || undefined;
    
    // Simple device type detection
    const ua = userAgent?.toLowerCase() || '';
    let deviceType = 'desktop';
    if (ua.includes('mobile')) deviceType = 'mobile';
    else if (ua.includes('tablet') || ua.includes('ipad')) deviceType = 'tablet';
    
    // Record the click (async, fire-and-forget with error handling)
    emailTrackingService.recordLinkClick(
      decoded.messageId,
      decoded.recipientEmail,
      decoded.originalUrl,
      undefined,
      {
        ipAddress,
        userAgent,
        deviceType,
      }
    ).catch(err => {
      // Log but don't block redirect on DB errors
      console.error('[TRACKING-CLICK] Failed to record click:', err);
    });

    // Emit pipeline engagement signal (async, fire-and-forget)
    emitEmailEngagementSignal('email_clicked', decoded.messageId, decoded.recipientEmail, decoded.originalUrl)
      .catch(err => console.warn('[TRACKING-CLICK] Pipeline signal failed:', err));
    
    // Redirect to original URL
    res.redirect(302, decoded.originalUrl);
  } catch (error) {
    console.error('[TRACKING-CLICK] Error processing click tracking:', error);
    res.status(500).send('Tracking error');
  }
});

/**
 * Get tracking stats for a message
 * GET /api/track/stats/:messageId
 */
router.get('/stats/:messageId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const stats = await emailTrackingService.getMessageTrackingStats(messageId);
    res.json(stats);
  } catch (error) {
    console.error('[TRACKING-STATS] Error:', error);
    res.status(500).json({ error: 'Failed to get tracking stats' });
  }
});

export default router;
