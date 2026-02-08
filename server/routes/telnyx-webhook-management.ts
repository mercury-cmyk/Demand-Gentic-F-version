/**
 * Telnyx Webhook Management Routes
 *
 * Admin routes for managing Telnyx TeXML application webhook URLs.
 * Allows switching between development (ngrok) and production webhook URLs.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import { env } from '../env';

const router = Router();

// Telnyx API base URL
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

interface TexmlApplication {
  id: string;
  friendly_name: string;
  voice_url: string;
  voice_method: string;
  voice_fallback_url?: string;
  status_callback_url?: string;
  status_callback_method?: string;
  inbound?: boolean;
  outbound?: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface WebhookConfig {
  voiceUrl: string;
  voiceFallbackUrl?: string;
  statusCallbackUrl: string;
}

/**
 * GET /api/telnyx/webhook-config - Get current webhook configuration for all apps
 */
router.get('/webhook-config', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const apiKey = env.TELNYX_API_KEY;
    const texmlAppId = env.TELNYX_TEXML_APP_ID;
    const callControlAppId = env.TELNYX_CALL_CONTROL_APP_ID;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Telnyx API key not configured. Set TELNYX_API_KEY in environment.',
      });
    }

    // Get current environment URLs
    const currentNgrokUrl = process.env.PUBLIC_WEBHOOK_HOST || '';
    const productionUrl = env.PUBLIC_TEXML_HOST || env.TELNYX_WEBHOOK_URL || '';

    // Fetch TeXML application details
    let texmlApp: any = null;
    if (texmlAppId) {
      try {
        const response = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          texmlApp = data.data;
        }
      } catch (e) {
        console.error('[Telnyx Webhook] Error fetching TeXML app:', e);
      }
    }

    // Fetch Call Control application details
    let callControlApp: any = null;
    if (callControlAppId) {
      try {
        const response = await fetch(`${TELNYX_API_BASE}/call_control_applications/${callControlAppId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          callControlApp = data.data;
        }
      } catch (e) {
        console.error('[Telnyx Webhook] Error fetching Call Control app:', e);
      }
    }

    // Fetch all TeXML applications
    let allTexmlApps: any[] = [];
    try {
      const response = await fetch(`${TELNYX_API_BASE}/texml_applications`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        allTexmlApps = data.data || [];
      }
    } catch (e) {
      console.error('[Telnyx Webhook] Error fetching all TeXML apps:', e);
    }

    // Fetch all Call Control applications
    let allCallControlApps: any[] = [];
    try {
      const response = await fetch(`${TELNYX_API_BASE}/call_control_applications`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        allCallControlApps = data.data || [];
      }
    } catch (e) {
      console.error('[Telnyx Webhook] Error fetching all Call Control apps:', e);
    }

    res.json({
      success: true,
      // Current TeXML app
      texmlAppId,
      appName: texmlApp?.friendly_name,
      currentConfig: texmlApp ? {
        voiceUrl: texmlApp.voice_url,
        voiceFallbackUrl: texmlApp.voice_fallback_url,
        statusCallbackUrl: texmlApp.status_callback,
        voiceMethod: texmlApp.voice_method,
        statusCallbackMethod: texmlApp.status_callback_method,
        active: texmlApp.active,
        inbound: texmlApp.inbound,
        outbound: texmlApp.outbound,
      } : null,
      // Current Call Control app
      callControlAppId,
      callControlAppName: callControlApp?.application_name,
      callControlConfig: callControlApp ? {
        webhookUrl: callControlApp.webhook_event_url,
        webhookFailoverUrl: callControlApp.webhook_event_failover_url,
        active: callControlApp.active,
      } : null,
      // All apps for selection
      allTexmlApps: allTexmlApps.map((app: any) => ({
        id: app.id,
        name: app.friendly_name,
        voiceUrl: app.voice_url,
        statusCallbackUrl: app.status_callback,
        active: app.active,
        isCurrent: app.id === texmlAppId,
      })),
      allCallControlApps: allCallControlApps.map((app: any) => ({
        id: app.id,
        name: app.application_name,
        webhookUrl: app.webhook_event_url,
        active: app.active,
        isCurrent: app.id === callControlAppId,
      })),
      environment: {
        ngrokUrl: currentNgrokUrl,
        productionUrl: productionUrl,
        isDevMode: process.env.NODE_ENV !== 'production',
      },
      updatedAt: texmlApp?.updated_at,
    });
  } catch (error: any) {
    console.error('[Telnyx Webhook] Error fetching config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook configuration',
      error: error.message,
    });
  }
});

/**
 * POST /api/telnyx/webhook-config - Update webhook URLs
 */
router.post('/webhook-config', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const apiKey = env.TELNYX_API_KEY;
    const texmlAppId = env.TELNYX_TEXML_APP_ID;

    if (!apiKey || !texmlAppId) {
      return res.status(400).json({
        success: false,
        message: 'Telnyx API key or TeXML App ID not configured',
      });
    }

    const { voiceUrl, statusCallbackUrl, voiceFallbackUrl } = req.body;

    if (!voiceUrl) {
      return res.status(400).json({
        success: false,
        message: 'Voice URL is required',
      });
    }

    // Build update payload - Telnyx TeXML API format
    const updatePayload: any = {
      voice_url: voiceUrl,
    };

    if (statusCallbackUrl) {
      updatePayload.status_callback = statusCallbackUrl;
    }

    if (voiceFallbackUrl) {
      updatePayload.voice_fallback_url = voiceFallbackUrl;
    }

    console.log(`[Telnyx Webhook] Updating TeXML app ${texmlAppId} with:`, updatePayload);

    // Update TeXML application
    const response = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Telnyx Webhook] Failed to update TeXML app:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        message: `Failed to update Telnyx TeXML application: ${response.status}`,
        error: errorText,
      });
    }

    const data = await response.json();
    const updatedApp = data.data as TexmlApplication;

    console.log(`[Telnyx Webhook] Successfully updated TeXML app webhooks`);

    res.json({
      success: true,
      message: 'Webhook URLs updated successfully',
      currentConfig: {
        voiceUrl: updatedApp.voice_url,
        voiceFallbackUrl: updatedApp.voice_fallback_url,
        statusCallbackUrl: updatedApp.status_callback || updatedApp.status_callback_url,
      },
    });
  } catch (error: any) {
    console.error('[Telnyx Webhook] Error updating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update webhook configuration',
      error: error.message,
    });
  }
});

/**
 * POST /api/telnyx/webhook-config/switch-to-dev - Switch to ngrok/dev URLs (TeXML + Call Control)
 */
router.post('/webhook-config/switch-to-dev', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const apiKey = env.TELNYX_API_KEY;
    const texmlAppId = env.TELNYX_TEXML_APP_ID;
    const callControlAppId = env.TELNYX_CALL_CONTROL_APP_ID;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Telnyx API key not configured',
      });
    }

    // Get ngrok URL from request body or environment
    let ngrokUrl = req.body.ngrokUrl || process.env.PUBLIC_WEBHOOK_HOST;

    if (!ngrokUrl) {
      return res.status(400).json({
        success: false,
        message: 'Ngrok URL not provided and PUBLIC_WEBHOOK_HOST not set. Please provide ngrokUrl in the request body.',
      });
    }

    // Ensure URL has https protocol
    if (!ngrokUrl.startsWith('http://') && !ngrokUrl.startsWith('https://')) {
      ngrokUrl = `https://${ngrokUrl}`;
    }

    // Remove trailing slash
    ngrokUrl = ngrokUrl.replace(/\/$/, '');

    const voiceUrl = `${ngrokUrl}/api/texml/ai-call`;
    const statusCallbackUrl = `${ngrokUrl}/api/webhooks/telnyx`;

    console.log(`[Telnyx Webhook] Switching ALL apps to dev mode:`, { voiceUrl, statusCallbackUrl });

    const results: any = {
      texml: null,
      callControl: null,
    };

    // Update TeXML application
    if (texmlAppId) {
      try {
        const response = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            voice_url: voiceUrl,
            status_callback: statusCallbackUrl,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          results.texml = { success: true, name: data.data.friendly_name };
          console.log(`[Telnyx Webhook] TeXML app updated: ${data.data.friendly_name}`);
        } else {
          const errorText = await response.text();
          results.texml = { success: false, error: errorText };
          console.error('[Telnyx Webhook] Failed to update TeXML app:', errorText);
        }
      } catch (e: any) {
        results.texml = { success: false, error: e.message };
      }
    }

    // Update Call Control application
    if (callControlAppId) {
      try {
        const response = await fetch(`${TELNYX_API_BASE}/call_control_applications/${callControlAppId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook_event_url: statusCallbackUrl,
            webhook_event_failover_url: statusCallbackUrl,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          results.callControl = { success: true, name: data.data.application_name };
          console.log(`[Telnyx Webhook] Call Control app updated: ${data.data.application_name}`);
        } else {
          const errorText = await response.text();
          results.callControl = { success: false, error: errorText };
          console.error('[Telnyx Webhook] Failed to update Call Control app:', errorText);
        }
      } catch (e: any) {
        results.callControl = { success: false, error: e.message };
      }
    }

    res.json({
      success: true,
      message: 'Switched to development (ngrok) webhook URLs',
      config: {
        voiceUrl,
        statusCallbackUrl,
        baseUrl: ngrokUrl,
      },
      results,
    });
  } catch (error: any) {
    console.error('[Telnyx Webhook] Error switching to dev:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch to development URLs',
      error: error.message,
    });
  }
});

/**
 * POST /api/telnyx/webhook-config/switch-to-prod - Switch to production URLs (TeXML + Call Control)
 */
router.post('/webhook-config/switch-to-prod', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const apiKey = env.TELNYX_API_KEY;
    const texmlAppId = env.TELNYX_TEXML_APP_ID;
    const callControlAppId = env.TELNYX_CALL_CONTROL_APP_ID;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Telnyx API key not configured',
      });
    }

    // Get production URL from request body or environment
    let prodUrl = req.body.productionUrl || env.PUBLIC_TEXML_HOST || env.TELNYX_WEBHOOK_URL;

    if (!prodUrl) {
      return res.status(400).json({
        success: false,
        message: 'Production URL not provided and PUBLIC_TEXML_HOST/TELNYX_WEBHOOK_URL not set. Please provide productionUrl in the request body.',
      });
    }

    // Ensure URL has https protocol
    if (!prodUrl.startsWith('http://') && !prodUrl.startsWith('https://')) {
      prodUrl = `https://${prodUrl}`;
    }

    // Remove trailing slash
    prodUrl = prodUrl.replace(/\/$/, '');

    const voiceUrl = `${prodUrl}/api/texml/ai-call`;
    const statusCallbackUrl = `${prodUrl}/api/webhooks/telnyx`;

    console.log(`[Telnyx Webhook] Switching ALL apps to production mode:`, { voiceUrl, statusCallbackUrl });

    const results: any = {
      texml: null,
      callControl: null,
    };

    // Update TeXML application
    if (texmlAppId) {
      try {
        const response = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            voice_url: voiceUrl,
            status_callback: statusCallbackUrl,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          results.texml = { success: true, name: data.data.friendly_name };
          console.log(`[Telnyx Webhook] TeXML app updated: ${data.data.friendly_name}`);
        } else {
          const errorText = await response.text();
          results.texml = { success: false, error: errorText };
          console.error('[Telnyx Webhook] Failed to update TeXML app:', errorText);
        }
      } catch (e: any) {
        results.texml = { success: false, error: e.message };
      }
    }

    // Update Call Control application
    if (callControlAppId) {
      try {
        const response = await fetch(`${TELNYX_API_BASE}/call_control_applications/${callControlAppId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook_event_url: statusCallbackUrl,
            webhook_event_failover_url: statusCallbackUrl,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          results.callControl = { success: true, name: data.data.application_name };
          console.log(`[Telnyx Webhook] Call Control app updated: ${data.data.application_name}`);
        } else {
          const errorText = await response.text();
          results.callControl = { success: false, error: errorText };
          console.error('[Telnyx Webhook] Failed to update Call Control app:', errorText);
        }
      } catch (e: any) {
        results.callControl = { success: false, error: e.message };
      }
    }

    res.json({
      success: true,
      message: 'Switched to production webhook URLs',
      config: {
        voiceUrl,
        statusCallbackUrl,
        baseUrl: prodUrl,
      },
      results,
    });
  } catch (error: any) {
    console.error('[Telnyx Webhook] Error switching to prod:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch to production URLs',
      error: error.message,
    });
  }
});

/**
 * GET /api/telnyx/phone-numbers - List all phone numbers on the account
 */
router.get('/phone-numbers', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const apiKey = env.TELNYX_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Telnyx API key not configured',
      });
    }

    const response = await fetch(`${TELNYX_API_BASE}/phone_numbers?page[size]=100`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `Failed to fetch phone numbers: ${response.status}`,
        error: errorText,
      });
    }

    const data = await response.json();

    res.json({
      success: true,
      phoneNumbers: data.data.map((num: any) => ({
        id: num.id,
        phoneNumber: num.phone_number,
        status: num.status,
        connectionId: num.connection_id,
        connectionName: num.connection_name,
        features: num.purchased_phone_number?.features || [],
      })),
      meta: data.meta,
    });
  } catch (error: any) {
    console.error('[Telnyx Webhook] Error fetching phone numbers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch phone numbers',
      error: error.message,
    });
  }
});

/**
 * GET /api/telnyx/texml-applications - List all TeXML applications
 */
router.get('/texml-applications', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const apiKey = env.TELNYX_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Telnyx API key not configured',
      });
    }

    const response = await fetch(`${TELNYX_API_BASE}/texml_applications`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `Failed to fetch TeXML applications: ${response.status}`,
        error: errorText,
      });
    }

    const data = await response.json();
    const currentAppId = env.TELNYX_TEXML_APP_ID;

    res.json({
      success: true,
      currentAppId,
      applications: data.data.map((app: TexmlApplication) => ({
        id: app.id,
        name: app.friendly_name,
        voiceUrl: app.voice_url,
        statusCallbackUrl: app.status_callback || app.status_callback_url,
        active: app.active,
        inbound: app.inbound,
        outbound: app.outbound,
        isCurrent: app.id === currentAppId,
        updatedAt: app.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('[Telnyx Webhook] Error fetching TeXML apps:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch TeXML applications',
      error: error.message,
    });
  }
});

export default router;
