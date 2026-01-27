/**
 * Port Configuration & Firewall Rules
 *
 * This module manages UDP port allocation and firewall configuration
 * for SIP and RTP media streams.
 *
 * Port allocation:
 * - 5060/UDP: SIP (unencrypted)
 * - 5061/UDP: SIPS (TLS)
 * - 10000-20000/UDP: RTP/RTCP media streams (configurable)
 *
 * For production, these ports must be:
 * 1. Open on the public firewall
 * 2. Routed through NAT to the SIP server
 * 3. Protected with fail2ban or similar
 */

import * as net from 'net';
import * as dgram from 'dgram';

export interface PortConfig {
  sipPort: number;
  sipsPort: number;
  rtpPortMin: number;
  rtpPortMax: number;
  publicIp: string;
}

export interface FirewallRule {
  protocol: 'tcp' | 'udp';
  port: number | string; // Can be range like "10000-20000"
  source: string; // CIDR notation or specific IP
  direction: 'inbound' | 'outbound';
  description: string;
}

/**
 * Port configuration from environment
 */
export function getPortConfig(): PortConfig {
  return {
    sipPort: parseInt(process.env.SIP_PORT || '5060'),
    sipsPort: parseInt(process.env.SIPS_PORT || '5061'),
    rtpPortMin: parseInt(process.env.RTP_PORT_MIN || '10000'),
    rtpPortMax: parseInt(process.env.RTP_PORT_MAX || '20000'),
    publicIp: process.env.PUBLIC_IP || '0.0.0.0',
  };
}

/**
 * Check if a port is available
 */
export async function checkPortAvailable(port: number, protocol: 'udp' | 'tcp' = 'udp'): Promise<boolean> {
  return new Promise((resolve) => {
    if (protocol === 'udp') {
      const socket = dgram.createSocket('udp4');
      socket.on('error', () => {
        socket.close();
        resolve(false);
      });
      socket.bind(port, '0.0.0.0', () => {
        socket.close();
        resolve(true);
      });
    } else {
      const server = net.createServer();
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    }
  });
}

/**
 * Validate port configuration
 */
export async function validatePortConfig(config: PortConfig): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check SIP port
  const sipAvailable = await checkPortAvailable(config.sipPort, 'udp');
  if (!sipAvailable) {
    issues.push(`SIP port ${config.sipPort}/UDP is not available`);
  }

  // Check SIPS port
  const sipsAvailable = await checkPortAvailable(config.sipsPort, 'udp');
  if (!sipsAvailable) {
    issues.push(`SIPS port ${config.sipsPort}/UDP is not available`);
  }

  // Check RTP port range
  if (config.rtpPortMin >= config.rtpPortMax) {
    issues.push(`Invalid RTP port range: ${config.rtpPortMin}-${config.rtpPortMax}`);
  }

  if (config.rtpPortMax - config.rtpPortMin < 1000) {
    issues.push(`RTP port range too small (need at least 1000 ports, got ${config.rtpPortMax - config.rtpPortMin})`);
  }

  // Check public IP
  if (!config.publicIp || config.publicIp === '0.0.0.0') {
    issues.push('PUBLIC_IP not set - SDP will use 0.0.0.0 (may not work for remote clients)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Generate firewall rules for SIP/RTP
 */
export function generateFirewallRules(config: PortConfig): FirewallRule[] {
  const rules: FirewallRule[] = [
    // SIP signaling
    {
      protocol: 'udp',
      port: config.sipPort,
      source: '0.0.0.0/0',
      direction: 'inbound',
      description: 'SIP signaling (unencrypted)',
    },
    {
      protocol: 'udp',
      port: config.sipsPort,
      source: '0.0.0.0/0',
      direction: 'inbound',
      description: 'SIPS signaling (TLS)',
    },
    // RTP media
    {
      protocol: 'udp',
      port: `${config.rtpPortMin}-${config.rtpPortMax}`,
      source: '0.0.0.0/0',
      direction: 'inbound',
      description: 'RTP/RTCP media streams',
    },
    {
      protocol: 'udp',
      port: `${config.rtpPortMin}-${config.rtpPortMax}`,
      source: '0.0.0.0/0',
      direction: 'outbound',
      description: 'RTP/RTCP media streams (outbound)',
    },
  ];

  return rules;
}

/**
 * Format firewall rules for GCP
 */
export function formatFirewallRulesGCP(config: PortConfig, networkName: string = 'default'): string[] {
  const rules: string[] = [];
  const baseRules = generateFirewallRules(config);

  baseRules.forEach((rule, index) => {
    const ruleName = `${networkName}-sip-rtp-${index}`;
    const sourceRanges = rule.source === '0.0.0.0/0' ? ['0.0.0.0/0'] : [rule.source];

    let portSpec: string;
    if (typeof rule.port === 'string' && rule.port.includes('-')) {
      portSpec = rule.port;
    } else {
      portSpec = rule.port.toString();
    }

    const gcloudCmd = `gcloud compute firewall-rules create ${ruleName} \\
      --network=${networkName} \\
      --allow=${rule.protocol}:${portSpec} \\
      --source-ranges=${sourceRanges.join(',')} \\
      --description="${rule.description}" \\
      --target-tags=sip-server`;

    rules.push(gcloudCmd);
  });

  return rules;
}

/**
 * Format firewall rules for AWS Security Groups
 */
export function formatFirewallRulesAWS(config: PortConfig, groupId: string): string[] {
  const rules: string[] = [];
  const baseRules = generateFirewallRules(config);

  baseRules.forEach((rule) => {
    if (rule.direction === 'inbound') {
      let portRange: { fromPort: number; toPort: number };

      if (typeof rule.port === 'string' && rule.port.includes('-')) {
        const [from, to] = rule.port.split('-').map(Number);
        portRange = { fromPort: from, toPort: to };
      } else {
        const port = typeof rule.port === 'string' ? parseInt(rule.port) : rule.port;
        portRange = { fromPort: port, toPort: port };
      }

      const awsCmd = `aws ec2 authorize-security-group-ingress \\
        --group-id ${groupId} \\
        --protocol ${rule.protocol.toUpperCase()} \\
        --port-range ${portRange.fromPort}-${portRange.toPort} \\
        --cidr ${rule.source} \\
        --region us-central1`;

      rules.push(awsCmd);
    }
  });

  return rules;
}

/**
 * Format firewall rules for Docker (UFW)
 */
export function formatFirewallRulesUFW(config: PortConfig): string[] {
  const rules: string[] = [];
  const baseRules = generateFirewallRules(config);

  baseRules.forEach((rule) => {
    if (rule.direction === 'inbound') {
      let portSpec: string;

      if (typeof rule.port === 'string' && rule.port.includes('-')) {
        portSpec = rule.port;
      } else {
        portSpec = rule.port.toString();
      }

      const ufwCmd = `sudo ufw allow in ${rule.protocol.toLowerCase()}/${portSpec}`;
      rules.push(ufwCmd);
    }
  });

  return rules;
}

/**
 * Format firewall rules for iptables
 */
export function formatFirewallRulesIptables(config: PortConfig): string[] {
  const rules: string[] = [];
  const baseRules = generateFirewallRules(config);

  baseRules.forEach((rule) => {
    if (rule.direction === 'inbound') {
      let portSpec: string;

      if (typeof rule.port === 'string' && rule.port.includes('-')) {
        portSpec = rule.port;
      } else {
        portSpec = rule.port.toString();
      }

      const iptablesCmd = `sudo iptables -A INPUT -p ${rule.protocol} --dport ${portSpec} -j ACCEPT`;
      rules.push(iptablesCmd);
    }
  });

  return rules;
}

/**
 * Port monitoring utility
 */
export class PortMonitor {
  private monitoredPorts: Map<number, { protocol: string; status: 'open' | 'closed'; lastCheck: Date }> = new Map();

  async monitorPort(port: number, protocol: 'udp' | 'tcp' = 'udp'): Promise<void> {
    const available = await checkPortAvailable(port, protocol);
    this.monitoredPorts.set(port, {
      protocol,
      status: available ? 'open' : 'closed',
      lastCheck: new Date(),
    });
  }

  async monitorRange(portMin: number, portMax: number, interval: number = 30000): Promise<void> {
    setInterval(async () => {
      for (let port = portMin; port <= portMax; port += 1000) {
        await this.monitorPort(port, 'udp');
      }
    }, interval);
  }

  getStatus(): Record<number, any> {
    const status: Record<number, any> = {};
    this.monitoredPorts.forEach((value, key) => {
      status[key] = value;
    });
    return status;
  }
}
