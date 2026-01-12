/**
 * WebRTC Connection Tester
 * 
 * Simple utility to test Telnyx WebRTC connectivity
 * without the full softphone interface.
 */

import { TelnyxRTC } from '@telnyx/webrtc';

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

export async function testWebRTCConnection(
  credentials: { username: string; password: string }
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

  try {
    // Test 1: SDK loaded
    if (typeof TelnyxRTC !== 'function') {
      throw new Error('Telnyx SDK not loaded properly');
    }
    result.details.sdkLoaded = true;

    // Test 2: Create client
    const client = new TelnyxRTC({
      login: credentials.username,
      password: credentials.password,
      useMicrophone: false, // Don't request mic for test
      useSpeaker: false
    });

    // Test 3: Connection with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout after 15 seconds'));
      }, 15000);

      let socketConnected = false;

      client.on('telnyx.socket.open', () => {
        socketConnected = true;
        result.details.socketConnected = true;
      });

      client.on('telnyx.ready', () => {
        result.details.authenticated = true;
        clearTimeout(timeout);
        resolve();
      });

      client.on('telnyx.error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      client.on('telnyx.socket.close', () => {
        if (!socketConnected) {
          clearTimeout(timeout);
          reject(new Error('Socket closed before connection established'));
        }
      });

      // Start connection
      client.connect().catch(reject);
    });

    result.success = true;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    result.details.duration = Date.now() - startTime;
  }

  return result;
}