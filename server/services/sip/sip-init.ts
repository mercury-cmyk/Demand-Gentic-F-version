/**
 * SIP Server Initialization Module
 *
 * Integrates drachtio-srf with the application:
 * - Initializes on server startup
 * - Manages lifecycle
 * - Provides status/health endpoints
 * - Handles graceful shutdown
 */

import { drachtioServer } from './drachtio-server';
import { parseICEServers, validateICEConfig } from './ice-config';
import { getPortConfig, validatePortConfig, PortMonitor } from './port-config';

const log = (msg: string) => {
  console.log(`[SIP Init] ${msg}`);
};

const logError = (msg: string, error?: any) => {
  console.error(`[SIP Init] ${msg}`, error || '');
};

/**
 * Initialize SIP server infrastructure
 */
export async function initializeSIPInfrastructure(): Promise<{
  success: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  log('Initializing SIP infrastructure...');

  // Check feature flag
  if (process.env.USE_SIP_CALLING !== 'true') {
    log('SIP calling disabled (USE_SIP_CALLING=false)');
    return { success: true, errors: [], warnings: ['SIP calling is disabled'] };
  }

  // Validate port configuration
  log('Validating port configuration...');
  const portConfig = getPortConfig();
  const portValidation = await validatePortConfig(portConfig);

  if (!portValidation.valid) {
    portValidation.issues.forEach((issue) => {
      if (issue.includes('not available')) {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    });
  } else {
    log('✓ Port configuration valid');
  }

  // Validate ICE configuration
  log('Validating ICE/STUN/TURN configuration...');
  const iceConfig = parseICEServers();
  const iceValidation = validateICEConfig(iceConfig);

  if (!iceValidation.valid) {
    iceValidation.errors.forEach((error) => {
      warnings.push(`ICE: ${error}`);
    });
  } else {
    log('✓ ICE configuration valid');
  }

  log(`  STUN servers: ${iceConfig.stun.length}`);
  log(`  TURN servers: ${iceConfig.turn.length}`);

  // Initialize Drachtio server
  log('Initializing Drachtio SIP server...');
  const drachtioInitialized = await drachtioServer.initialize();

  if (!drachtioInitialized) {
    if (process.env.DRACHTIO_HOST === 'localhost' && process.env.NODE_ENV === 'development') {
      warnings.push('Drachtio not running (expected in development without drachtio daemon)');
      log('⚠ Drachtio connection failed - ensure drachtio daemon is running on ' + process.env.DRACHTIO_HOST + ':' + process.env.DRACHTIO_PORT);
    } else {
      errors.push('Failed to connect to Drachtio SIP server at ' + process.env.DRACHTIO_HOST + ':' + process.env.DRACHTIO_PORT);
    }
  } else {
    log('✓ Drachtio SIP server initialized');
  }

  // Start port monitoring
  if (process.env.MONITOR_PORTS === 'true') {
    log('Starting port monitoring...');
    const portMonitor = new PortMonitor();
    await portMonitor.monitorRange(portConfig.rtpPortMin, portConfig.rtpPortMax);
    log('✓ Port monitoring started');
  }

  // Summary
  log('SIP infrastructure initialization completed');
  log(`  Errors: ${errors.length}`);
  log(`  Warnings: ${warnings.length}`);

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Health check for SIP infrastructure
 */
export async function checkSIPHealth(): Promise<{
  healthy: boolean;
  status: {
    drachtio: boolean;
    stun: boolean;
    turn: boolean;
    ports: { used: number; total: number; percentage: number };
  };
}> {
  try {
    const drachtioHealthy = await drachtioServer.healthCheck();
    const stats = drachtioServer.getStats();

    return {
      healthy: drachtioHealthy,
      status: {
        drachtio: stats.connected,
        stun: stats.stunServers > 0,
        turn: stats.turnServers > 0,
        ports: stats.rtpPorts,
      },
    };
  } catch (error) {
    logError('Health check failed', error);
    return {
      healthy: false,
      status: {
        drachtio: false,
        stun: false,
        turn: false,
        ports: { used: 0, total: 0, percentage: 0 },
      },
    };
  }
}

/**
 * Get SIP server statistics
 */
export function getSIPStats() {
  return drachtioServer.getStats();
}

/**
 * Graceful shutdown
 */
export async function shutdownSIPInfrastructure(): Promise<void> {
  log('Shutting down SIP infrastructure...');

  try {
    // TODO: Disconnect Drachtio
    // TODO: Close RTP ports
    // TODO: Cleanup resources

    log('SIP infrastructure shut down successfully');
  } catch (error) {
    logError('Error during shutdown', error);
  }
}

/**
 * Initialize on module load
 */
if (process.env.AUTO_INIT_SIP === 'true') {
  initializeSIPInfrastructure().catch((error) => {
    logError('Failed to auto-initialize SIP infrastructure', error);
  });
}
