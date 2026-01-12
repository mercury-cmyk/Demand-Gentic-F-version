/**
 * Network Diagnostics and Alternative Connection Methods
 * For troubleshooting WebRTC socket connection issues
 */

export interface NetworkDiagnostics {
  userAgent: string;
  online: boolean;
  connection?: string;
  websocketSupport: boolean;
  webrtcSupport: boolean;
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
  wss?: boolean; // Force secure websocket
  
  // WebRTC configuration
  iceServers?: RTCIceServer[];
  
  // Fallback options
  enableFallback?: boolean;
  fallbackHost?: string;
  fallbackPort?: number;
}

export class NetworkDiagnostics {
  
  static async diagnose(): Promise<NetworkDiagnostics> {
    const result: NetworkDiagnostics = {
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      connection: (navigator as any).connection?.effectiveType || 'unknown',
      websocketSupport: 'WebSocket' in window,
      webrtcSupport: 'RTCPeerConnection' in window,
      stunServers: [],
      timestamp: Date.now()
    };
    
    // Test STUN servers
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      result.stunServers = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
      pc.close();
    } catch (error) {
      console.warn('[NetworkDiagnostics] STUN server test failed:', error);
    }
    
    return result;
  }
  
  static async testWebSocket(url: string): Promise<{ success: boolean; error?: string; latency?: number }> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      try {
        const ws = new WebSocket(url);
        
        const timeout = setTimeout(() => {
          ws.close();
          resolve({ success: false, error: 'Connection timeout (10s)' });
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(timeout);
          const latency = Date.now() - startTime;
          ws.close();
          resolve({ success: true, latency });
        };
        
        ws.onerror = (error) => {
          clearTimeout(timeout);
          resolve({ success: false, error: 'WebSocket error: ' + error.toString() });
        };
        
        ws.onclose = (event) => {
          clearTimeout(timeout);
          if (event.wasClean) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `WebSocket closed unexpectedly: ${event.code} ${event.reason}` });
          }
        };
        
      } catch (error) {
        resolve({ success: false, error: 'Failed to create WebSocket: ' + (error as Error).message });
      }
    });
  }
  
  static getAlternativeConfigs(): TelnyxConnectionOptions[] {
    return [
      // Standard configuration
      {
        enableFallback: false
      },
      
      // Force secure WebSocket
      {
        wss: true,
        enableFallback: false
      },
      
      // Alternative STUN/TURN servers for corporate networks
      {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.stunprotocol.org:3478' }
        ],
        enableFallback: false
      },
      
      // Telnyx with explicit host/port (if behind corporate proxy)
      {
        host: 'rtc.telnyx.com',
        port: 443,
        wss: true,
        enableFallback: false
      }
    ];
  }
}