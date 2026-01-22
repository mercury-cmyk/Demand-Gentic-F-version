/**
 * Network Diagnostics and Alternative Connection Methods
 * For troubleshooting WebRTC connection issues
 *
 * NOTE: This module uses RTCPeerConnection for connectivity testing.
 * The Telnyx SDK handles its own signaling transport internally.
 */

export interface NetworkDiagnosticsResult {
  userAgent: string;
  online: boolean;
  connection?: string;
  webrtcSupport: boolean;
  stunServerReachable: boolean;
  stunServers: string[];
  timestamp: number;
}

export interface TelnyxConnectionOptions {
  // Standard options
  token?: string;
  username?: string;
  password?: string;

  // Network options for corporate/restrictive environments
  host?: string;
  port?: number;
  secure?: boolean; // Use secure transport

  // WebRTC configuration
  iceServers?: RTCIceServer[];

  // Fallback options
  enableFallback?: boolean;
  fallbackHost?: string;
  fallbackPort?: number;
}

// NOTE: The Telnyx SDK handles signaling internally - these constants are kept for reference only
// Do NOT use these to manually configure the SDK connection
export const TELNYX_SDK_NOTE = 'The Telnyx SDK handles signaling automatically';

export class NetworkDiagnostics {

  /**
   * Run comprehensive network diagnostics using WebRTC
   */
  static async diagnose(): Promise<NetworkDiagnosticsResult> {
    const result: NetworkDiagnosticsResult = {
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      connection: (navigator as any).connection?.effectiveType || 'unknown',
      webrtcSupport: 'RTCPeerConnection' in window,
      stunServerReachable: false,
      stunServers: [],
      timestamp: Date.now()
    };

    // Test STUN servers using RTCPeerConnection ICE gathering
    try {
      const stunReachable = await this.testStunConnectivity();
      result.stunServerReachable = stunReachable;
      if (stunReachable) {
        result.stunServers = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
      }
    } catch (error) {
      console.warn('[NetworkDiagnostics] STUN server test failed:', error);
    }

    return result;
  }

  /**
   * Test STUN server connectivity using WebRTC ICE candidate gathering
   * This is the proper way to test network connectivity for WebRTC
   */
  static async testStunConnectivity(): Promise<boolean> {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      const timeout = setTimeout(() => {
        pc.close();
        resolve(false);
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate && event.candidate.type === 'srflx') {
          // Got a server reflexive candidate - STUN is working
          clearTimeout(timeout);
          pc.close();
          resolve(true);
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          pc.close();
          // If we completed gathering without srflx, STUN may be blocked
          resolve(false);
        }
      };

      // Create a data channel to trigger ICE gathering
      pc.createDataChannel('connectivity-test');

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timeout);
          pc.close();
          resolve(false);
        });
    });
  }

  /**
   * Test WebRTC peer connection capability
   * Returns latency to establish a local connection
   */
  static async testWebRTCCapability(): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now();

    try {
      const pc = new RTCPeerConnection();
      pc.createDataChannel('test');

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      pc.close();

      return {
        success: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: 'WebRTC not available: ' + (error as Error).message
      };
    }
  }

  /**
   * Get alternative Telnyx connection configurations
   * for troubleshooting connectivity issues.
   * NOTE: The Telnyx SDK handles signaling automatically - these only affect ICE servers
   */
  static getAlternativeConfigs(): TelnyxConnectionOptions[] {
    return [
      // Standard configuration - SDK uses default signaling
      {
        enableFallback: false
      },

      // Force secure transport - SDK uses default signaling
      {
        secure: true,
        enableFallback: false
      },

      // Alternative STUN/TURN servers for corporate networks
      // (only affects ICE negotiation, not signaling)
      {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.stunprotocol.org:3478' }
        ],
        enableFallback: false
      }
    ];
  }
}
