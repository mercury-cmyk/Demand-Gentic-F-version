/**
 * Media Bridge Client
 *
 * HTTP client used by Cloud Run to control the media bridge running on the Drachtio VM.
 * The media bridge handles RTP ↔ Gemini Live audio bridging.
 */

const MEDIA_BRIDGE_HOST = (process.env.MEDIA_BRIDGE_HOST || process.env.PUBLIC_IP || '').trim();
const MEDIA_BRIDGE_PORT = parseInt(process.env.MEDIA_BRIDGE_PORT || '8090');
const MEDIA_BRIDGE_SECRET = process.env.MEDIA_BRIDGE_SECRET || 'bridge-secret';

const log = (msg: string) => console.log(`[MediaBridgeClient] ${msg}`);
const logError = (msg: string, err?: any) => console.error(`[MediaBridgeClient] ${msg}`, err || '');

function getBaseUrl(): string {
  if (!MEDIA_BRIDGE_HOST) {
    throw new Error('MEDIA_BRIDGE_HOST (or PUBLIC_IP) not configured');
  }
  return `http://${MEDIA_BRIDGE_HOST}:${MEDIA_BRIDGE_PORT}`;
}

/**
 * Create a media bridge session on the VM.
 * The bridge will:
 * - Bind a UDP socket on rtpPort to receive/send RTP
 * - Connect to Gemini Live via WebSocket
 * - Bridge audio bidirectionally (G.711 ↔ PCM ↔ Gemini)
 */
export async function createMediaBridge(params: {
  callId: string;
  rtpPort: number;
  remoteAddress: string;
  remotePort: number;
  systemPrompt: string;
  voiceName?: string;
  toPhoneNumber?: string;
  contactName?: string;
  firstMessage?: string;
  context?: any;
  maxDurationSeconds?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${getBaseUrl()}/bridge`;
    const payload = {
      ...params,
      secret: MEDIA_BRIDGE_SECRET,
    };
    log(`Creating bridge for ${params.callId} (RTP ${params.rtpPort}, remote ${params.remoteAddress}:${params.remotePort})`);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': MEDIA_BRIDGE_SECRET,
        'X-Media-Bridge-Secret': MEDIA_BRIDGE_SECRET,
        'Authorization': `Bearer ${MEDIA_BRIDGE_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000), // 20s timeout (Gemini connection can take a few seconds)
    });

    const data = await resp.json() as any;
    if (!resp.ok || !data.success) {
      logError(`Failed to create bridge for ${params.callId}: ${data.error}`);
      return { success: false, error: data.error || `HTTP ${resp.status}` };
    }

    log(`Bridge created for ${params.callId}`);
    return { success: true };
  } catch (err: any) {
    logError(`Error creating bridge for ${params.callId}`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Destroy a media bridge session on the VM.
 */
export async function destroyMediaBridge(callId: string): Promise<void> {
  try {
    const url = `${getBaseUrl()}/bridge/${callId}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-Bridge-Secret': MEDIA_BRIDGE_SECRET,
        'X-Media-Bridge-Secret': MEDIA_BRIDGE_SECRET,
        'Authorization': `Bearer ${MEDIA_BRIDGE_SECRET}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      log(`Bridge destroyed for ${callId}`);
    }
  } catch (err) {
    logError(`Error destroying bridge for ${callId}`, err);
  }
}

/**
 * Check media bridge health
 */
export async function getMediaBridgeHealth(): Promise<{
  available: boolean;
  activeSessions?: number;
  error?: string;
}> {
  try {
    const url = `${getBaseUrl()}/health`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) {
      return { available: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json() as any;
    return { available: true, activeSessions: data.activeSessions };
  } catch (err: any) {
    return { available: false, error: err.message };
  }
}

/**
 * Check if the media bridge is configured and reachable
 */
export function isMediaBridgeConfigured(): boolean {
  return !!MEDIA_BRIDGE_HOST;
}
