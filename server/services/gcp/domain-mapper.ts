import { EventEmitter } from 'events';

interface DomainMapping {
  domain: string;
  cloudRunService: string;
  environment: 'dev' | 'staging' | 'prod';
  sslStatus: 'ACTIVE' | 'PENDING' | 'EXPIRED';
  sslExpiry?: Date;
  createdAt: Date;
  lastChecked?: Date;
}

export class DomainMapper extends EventEmitter {
  private projectId: string;
  private domainMappings: Map<string, DomainMapping> = new Map();

  constructor(projectId: string) {
    super();
    this.projectId = projectId;
  }

  /**
   * Map a custom domain to a Cloud Run service
   */
  async mapDomain(config: {
    domain: string;
    cloudRunService: string;
    environment: 'dev' | 'staging' | 'prod';
  }): Promise<DomainMapping> {
    try {
      this.emit('domain:mapping:started', {
        domain: config.domain,
        timestamp: new Date(),
      });

      // Generate DNS records needed
      const dnsRecords = this.generateDNSRecords(config.domain, config.cloudRunService);

      const mapping: DomainMapping = {
        domain: config.domain,
        cloudRunService: config.cloudRunService,
        environment: config.environment,
        sslStatus: 'PENDING',
        createdAt: new Date(),
      };

      // Store mapping (in real implementation, save to database)
      this.domainMappings.set(config.domain, mapping);

      this.emit('domain:mapping:complete', {
        domain: config.domain,
        dnsRecords,
        timestamp: new Date(),
      });

      return mapping;
    } catch (error) {
      this.emit('domain:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * Generate DNS records needed for domain mapping
   */
  generateDNSRecords(domain: string, cloudRunService: string): Array<{
    name: string;
    type: string;
    ttl: number;
    rrdatas: string[];
    instructions: string;
  }> {
    const cloudRunDomain = `${cloudRunService}.run.app`;

    return [
      {
        name: domain,
        type: 'CNAME',
        ttl: 300,
        rrdatas: [cloudRunDomain],
        instructions: `Add a CNAME record pointing ${domain} to ${cloudRunDomain}`,
      },
      {
        name: `tmp-${domain}`,
        type: 'TXT',
        ttl: 300,
        rrdatas: [`v=goog-site-verification=${this._generateVerificationToken()}`],
        instructions: `Add this TXT record to verify domain ownership`,
      },
    ];
  }

  /**
   * Check domain health and SSL status
   */
  async checkDomainHealth(domain: string): Promise<{
    domain: string;
    httpStatus: number;
    sslStatus: string;
    sslExpiry?: Date;
    dnsStatus: 'PROPAGATED' | 'PENDING';
    lastChecked: Date;
  }> {
    try {
      const mapping = this.domainMappings.get(domain);
      if (!mapping) {
        throw new Error(`Domain ${domain} not mapped`);
      }

      // Check DNS propagation
      const dnsStatus = await this.checkDNSPropagation(domain);

      // Check SSL cert (in real impl, call cert provider API)
      const sslStatus = await this.checkSSLCertificate(domain);

      // Check HTTP health
      let httpStatus = 0;
      try {
        const response = await fetch(`https://${domain}`, { method: 'HEAD' });
        httpStatus = response.status;
      } catch (error) {
        httpStatus = 0;
      }

      const result = {
        domain,
        httpStatus,
        sslStatus: sslStatus.status,
        sslExpiry: sslStatus.expiry,
        dnsStatus,
        lastChecked: new Date(),
      };

      // Update mapping
      mapping.lastChecked = result.lastChecked;
      mapping.sslStatus = sslStatus.status as any;
      mapping.sslExpiry = sslStatus.expiry;

      this.emit('domain:health:checked', result);

      return result;
    } catch (error) {
      this.emit('domain:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * Check DNS propagation
   */
  private async checkDNSPropagation(
    domain: string
  ): Promise<'PROPAGATED' | 'PENDING'> {
    try {
      // In real implementation, query DNS servers
      // Mock: assume propagation after 5 minutes
      const mapping = this.domainMappings.get(domain);
      if (!mapping) return 'PENDING';

      const age = Date.now() - mapping.createdAt.getTime();
      return age > 5 * 60 * 1000 ? 'PROPAGATED' : 'PENDING';
    } catch (error) {
      return 'PENDING';
    }
  }

  /**
   * Check SSL certificate
   */
  private async checkSSLCertificate(
    domain: string
  ): Promise<{ status: string; expiry?: Date }> {
    try {
      // In real implementation, fetch cert from Google-managed certs
      // Mock implementation
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      return {
        status: 'ACTIVE',
        expiry: expiryDate,
      };
    } catch (error) {
      return {
        status: 'UNKNOWN',
      };
    }
  }

  /**
   * Remove domain mapping
   */
  async removeDomain(domain: string): Promise<void> {
    try {
      this.emit('domain:removal:started', {
        domain,
        timestamp: new Date(),
      });

      this.domainMappings.delete(domain);

      this.emit('domain:removal:complete', {
        domain,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emit('domain:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * List all domain mappings
   */
  listDomains(): DomainMapping[] {
    return Array.from(this.domainMappings.values());
  }

  /**
   * Get domain details
   */
  getDomain(domain: string): DomainMapping | undefined {
    return this.domainMappings.get(domain);
  }

  /**
   * Renew SSL certificate
   */
  async renewSSLCertificate(domain: string): Promise<void> {
    try {
      const mapping = this.domainMappings.get(domain);
      if (!mapping) {
        throw new Error(`Domain ${domain} not found`);
      }

      this.emit('ssl:renewal:started', {
        domain,
        timestamp: new Date(),
      });

      // In real implementation, trigger cert renewal
      mapping.sslStatus = 'ACTIVE';
      mapping.sslExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      this.emit('ssl:renewal:complete', {
        domain,
        expiry: mapping.sslExpiry,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emit('ssl:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * Generate verification token for domain ownership
   */
  private _generateVerificationToken(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

export default DomainMapper;
