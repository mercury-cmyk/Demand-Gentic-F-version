/**
 * STUN/TURN Server Configuration
 *
 * STUN (Session Traversal Utilities for NAT) - helps clients discover their public IP
 * TURN (Traversal Using Relays around NAT) - relays media when direct connection fails
 *
 * Supports:
 * - coturn (open-source TURN server)
 * - Google TURN (cloud-based)
 * - Twilio TURN
 * - Custom TURN servers
 *
 * Configuration via environment:
 * - STUN_SERVERS: Comma-separated STUN server URLs
 * - TURN_SERVERS: JSON array of TURN server configs
 * - TURN_USERNAME: TURN username (if using authenticated TURN)
 * - TURN_PASSWORD: TURN password (if using authenticated TURN)
 */

export interface STUNServer {
  urls: string[];
}

export interface TURNServer {
  urls: string[];
  username?: string;
  credential?: string;
  credentialType?: 'password' | 'oauth';
}

export interface ICEServers {
  stun: STUNServer[];
  turn: TURNServer[];
}

/**
 * Parse STUN/TURN configuration from environment
 */
export function parseICEServers(): ICEServers {
  const servers: ICEServers = {
    stun: [],
    turn: [],
  };

  // Parse STUN servers
  const stunServers = process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
  const stunUrls = stunServers
    .split(',')
    .map((url: string) => url.trim())
    .filter((url: string) => url.length > 0);

  if (stunUrls.length > 0) {
    servers.stun.push({
      urls: stunUrls,
    });
  }

  // Parse TURN servers
  if (process.env.TURN_SERVERS) {
    try {
      const turnConfigs = JSON.parse(process.env.TURN_SERVERS);
      if (Array.isArray(turnConfigs)) {
        servers.turn.push(...turnConfigs);
      }
    } catch (error) {
      console.error('[ICE Config] Failed to parse TURN_SERVERS:', error);
    }
  }

  // If TURN_USERNAME and TURN_PASSWORD are set, add authenticated TURN
  if (process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    const turnUrl = process.env.TURN_URL || 'turn:turn.server.com:3478';
    servers.turn.push({
      urls: [turnUrl],
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  }

  return servers;
}

/**
 * Default public STUN servers (no auth required)
 */
export const DEFAULT_STUN_SERVERS: string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
  'stun:stun.stunprotocol.org:3478',
  'stun:stun1.stunprotocol.org:3478',
];

/**
 * Generate ICE servers configuration for WebRTC connections
 */
export function generateICEConfig(): ICEServers {
  return parseICEServers();
}

/**
 * Validate ICE server configuration
 */
export function validateICEConfig(config: ICEServers): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.stun || config.stun.length === 0) {
    errors.push('No STUN servers configured');
  }

  if (!config.turn || config.turn.length === 0) {
    console.warn('[ICE Config] No TURN servers configured - direct media will fail if behind NAT');
  }

  config.stun.forEach((stun, i) => {
    if (!stun.urls || stun.urls.length === 0) {
      errors.push(`STUN server ${i}: no URLs configured`);
    }
  });

  config.turn.forEach((turn, i) => {
    if (!turn.urls || turn.urls.length === 0) {
      errors.push(`TURN server ${i}: no URLs configured`);
    }
    if (turn.username && !turn.credential) {
      errors.push(`TURN server ${i}: username set but no credential`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format ICE servers for SDP
 */
export function formatICEForSDP(config: ICEServers): string {
  const lines: string[] = [];

  // Add STUN candidates
  config.stun.forEach((stun) => {
    stun.urls.forEach((url) => {
      lines.push(`a=ice-ufrag:${generateUfrag()}`);
      lines.push(`a=ice-pwd:${generatePwd()}`);
    });
  });

  // Add TURN candidates
  config.turn.forEach((turn) => {
    turn.urls.forEach((url) => {
      let candidate = `a=candidate:${generateCandidate()} 1 udp ${generatePriority()} ${url.split(':')[1]} ${url.split(':')[2] || 3478} typ relay`;
      if (turn.username) {
        candidate += ` username ${turn.username}`;
      }
      lines.push(candidate);
    });
  });

  return lines.join('\n');
}

function generateUfrag(): string {
  return Math.random().toString(36).substr(2, 16);
}

function generatePwd(): string {
  return Math.random().toString(36).substr(2, 24);
}

function generateCandidate(): string {
  return Math.random().toString(36).substr(2, 16);
}

function generatePriority(): number {
  return Math.floor(Math.random() * 2000000000);
}

/**
 * Coturn configuration template
 */
export const COTURN_CONFIG_TEMPLATE = `
# Coturn TURN/STUN Server Configuration
# For production deployment on dedicated VM

# Listening IP addresses
listening-ip=0.0.0.0
listening-ip=::
listening-port=3478
listening-port=5349
listening-port=5349
alt-listening-port=3479
alt-listening-port=5350

# Relay IP (public IP of this server)
external-ip=\${PUBLIC_IP}/\${PRIVATE_IP}

# Credentials
user=\${TURN_USERNAME}:\${TURN_PASSWORD}

# Realm
realm=turnserver.example.com

# Database
userdb=/var/lib/coturn/turnserver.sqlite

# Logging
log-file=/var/log/coturn/turnserver.log
verbose

# Security
fingerprint
mobility
bps-capacity=1000000
max-bps=1000000
bps-capacity-over=200000

# Connection limits
max-allocate-lifetime=600
user-quota=100000
total-quota=500000
`;

/**
 * Deployment helper for coturn
 */
export async function deployCoturn(options: {
  publicIp: string;
  privateIp: string;
  turnUsername: string;
  turnPassword: string;
  realm: string;
}): Promise {
  const config = COTURN_CONFIG_TEMPLATE.replace(/\$\{PUBLIC_IP\}/g, options.publicIp)
    .replace(/\$\{PRIVATE_IP\}/g, options.privateIp)
    .replace(/\$\{TURN_USERNAME\}/g, options.turnUsername)
    .replace(/\$\{TURN_PASSWORD\}/g, options.turnPassword)
    .replace(/turnserver\.example\.com/g, options.realm);

  return config;
}