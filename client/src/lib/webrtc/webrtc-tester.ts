/**
 * WebRTC Connection Tester
 * 
 * Simple utility to test Telnyx WebRTC connectivity
 * without the full softphone interface.
 */

import { TelnyxRTC } from '@telnyx/webrtc';
import type { TelnyxConnectionOptions } from './network-diagnostics';

export interface WebRTCTestResult {
  success: boolean;
  error?: string;
  details: {
    sdkLoaded: boolean;
    socketConnected: boolean;
    authenticated: boolean;
    duration: number;
  };
}

export type ConnectionTestResult = WebRTCTestResult;

type WebRTCTestCredentials = {
  username?: string;
  password?: string;
  token?: string;
};

const buildHostUrl = (options?: TelnyxConnectionOptions): string | undefined => {
  if (!options) return undefined;

  const selectedHost = options.host ?? (options.enableFallback ? options.fallbackHost : undefined);
  const selectedPort = options.port ?? (options.enableFallback ? options.fallbackPort : undefined);

  if (!selectedHost) return undefined;

  const hasScheme = /^wss?:\/\//i.test(selectedHost);
  const scheme = hasScheme ? '' : options.wss === false ? 'ws://' : 'wss://';
  const base = `${scheme}${selectedHost}`;

  try {
    const url = new URL(base);
    if (selectedPort) {
      url.port = String(selectedPort);
    }
    return url.toString();
  } catch {
    return base;
  }
};

const formatCloseDetails = (event?: CloseEvent | null): string => {
  if (!event) return '';

  const details: string[] = [];
  if (typeof event.code === 'number') details.push(`code=${event.code}`);
  if (event.reason) details.push(`reason=${event.reason}`);
  if (typeof event.wasClean === 'boolean') details.push(`clean=${event.wasClean}`);

  return details.length ? ` (${details.join(', ')})` : '';
};

export async function testWebRTCConnection(
  credentials: WebRTCTestCredentials,
  connectionOptions?: TelnyxConnectionOptions
): Promise<WebRTCTestResult> {
  const startTime = Date.now();
  const result: WebRTCTestResult = {
    success: false,
    details: {
      sdkLoaded: false,
      socketConnected: false,
      authenticated: false,
      duration: 0
    }
  };

  let client: TelnyxRTC | null = null;

  try {
    // Test 1: SDK loaded
    if (typeof TelnyxRTC !== 'function') {
      throw new Error('Telnyx SDK not loaded properly');
    }
    result.details.sdkLoaded = true;

    const auth = {
      token: connectionOptions?.token ?? credentials.token,
      username: connectionOptions?.username ?? credentials.username,
      password: connectionOptions?.password ?? credentials.password,
    };

    if (!auth.token && !(auth.username && auth.password)) {
      throw new Error('Missing Telnyx credentials');
    }

    const hostUrl = buildHostUrl(connectionOptions);

    // Test 2: Create client
    const clientOptions: Record<string, unknown> = {
      ...(hostUrl ? { host: hostUrl } : {}),
      ...(connectionOptions?.iceServers ? { iceServers: connectionOptions.iceServers } : {}),
    };

    if (auth.token) {
      clientOptions.login_token = auth.token;
    } else {
      clientOptions.login = auth.username;
      clientOptions.password = auth.password;
    }

    client = new TelnyxRTC(clientOptions as any);
    const telnyxClient = client;

    if (!telnyxClient) {
      throw new Error('Failed to initialize Telnyx client');
    }

    // Test 3: Connection with timeout
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      let socketConnected = false;
      let socketCloseEvent: CloseEvent | null = null;

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };

      const finishReject = (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err);
      };

      timeout = setTimeout(() => {
        finishReject(new Error('Connection timeout after 15 seconds'));
      }, 15000);

      telnyxClient.on('telnyx.socket.open', () => {
        socketConnected = true;
        result.details.socketConnected = true;
      });

      telnyxClient.on('telnyx.ready', () => {
        result.details.authenticated = true;
        finishResolve();
      });

      telnyxClient.on('telnyx.error', (error: Error) => {
        finishReject(error);
      });

      telnyxClient.on('telnyx.socket.error', (event: Event) => {
        finishReject(new Error(`WebSocket error: ${event.type || 'unknown'}`));
      });

      telnyxClient.on('telnyx.socket.close', (event: CloseEvent) => {
        socketCloseEvent = event;
        if (!socketConnected) {
          finishReject(
            new Error(`Socket closed before connection established${formatCloseDetails(socketCloseEvent)}`)
          );
        }
      });

      // Start connection
      telnyxClient.connect().catch((error: Error) => finishReject(error));
    });

    result.success = true;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    try {
      client?.disconnect();
    } catch (error) {
      console.warn('[WebRTC-Test] Failed to disconnect Telnyx client:', error);
    }
    result.details.duration = Date.now() - startTime;
  }

  return result;
}
