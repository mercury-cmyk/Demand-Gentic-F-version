/**
 * Mailgun Domain Sync Service
 * Syncs domain verification status from Mailgun API to local database
 */

import { storage } from "../storage";

interface MailgunDomainResponse {
  domain: {
    name: string;
    state: string; // 'active', 'unverified', etc.
    smtp_login: string;
    spam_action: string;
    wildcard: boolean;
    created_at: string;
  };
  receiving_dns_records: Array<{
    priority: string;
    record_type: string;
    valid: string;
    value: string;
  }>;
  sending_dns_records: Array<{
    cached: string[];
    name: string;
    record_type: string;
    valid: string;
    value: string;
  }>;
}

export class MailgunSyncService {
  private apiKey: string;
  private apiBase: string;

  constructor() {
    this.apiKey = process.env.MAILGUN_API_KEY || '';
    this.apiBase = process.env.MAILGUN_API_BASE || 'https://api.mailgun.net/v3';
    
    if (!this.apiKey) {
      console.warn('[MailgunSync] MAILGUN_API_KEY not configured - sync disabled');
    }
  }

  /**
   * Check if Mailgun is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get domain verification status from Mailgun
   */
  async getDomainFromMailgun(domain: string): Promise<MailgunDomainResponse | null> {
    if (!this.isConfigured()) {
      console.log('[MailgunSync] Mailgun not configured, skipping API check');
      return null;
    }

    try {
      const auth = Buffer.from(`api:${this.apiKey}`).toString('base64');
      const response = await fetch(`${this.apiBase}/domains/${domain}`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MailgunSync] Mailgun API error for ${domain}:`, response.status, errorText);
        return null;
      }

      const data = await response.json();
      console.log(`[MailgunSync] Mailgun response for ${domain}:`, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      console.error('[MailgunSync] Error fetching domain from Mailgun:', error);
      return null;
    }
  }

  /**
   * Sync all domains from database with Mailgun
   */
  async syncAllDomains(): Promise<{ synced: number; errors: number }> {
    if (!this.isConfigured()) {
      return { synced: 0, errors: 0 };
    }

    console.log('[MailgunSync] Starting domain verification sync');
    const domains = await storage.getDomainAuths();
    let synced = 0;
    let errors = 0;

    for (const domain of domains) {
      try {
        const mailgunData = await this.getDomainFromMailgun(domain.domain);
        
        if (!mailgunData) {
          errors++;
          continue;
        }

        // Parse DNS verification status from Mailgun
        const sendingRecords = mailgunData.sending_dns_records;
        
        // SPF: TXT record for domain
        const spfRecord = sendingRecords.find(r => 
          r.record_type === 'TXT' && 
          r.name === domain.domain &&
          r.value.includes('spf')
        );
        
        // DKIM: Can be TXT or CNAME records containing "_domainkey"
        const dkimRecords = sendingRecords.filter(r => 
          r.name.includes('_domainkey') &&
          (r.record_type === 'TXT' || r.record_type === 'CNAME')
        );
        
        // DMARC: TXT record for _dmarc subdomain (not always in Mailgun API)
        const dmarcRecord = sendingRecords.find(r => 
          r.record_type === 'TXT' && 
          r.name === `_dmarc.${domain.domain}`
        );

        // Determine status
        const spfStatus = spfRecord?.valid === 'valid' ? 'verified' : 'failed';
        
        // For DKIM, check if at least one DKIM record is valid
        const dkimStatus = dkimRecords.length > 0 && dkimRecords.some(r => r.valid === 'valid') 
          ? 'verified' 
          : 'failed';
        
        // For DMARC, mark as verified if record exists and is valid, otherwise 'pending'
        // (Mailgun doesn't always return DMARC in API)
        const dmarcStatus = dmarcRecord 
          ? (dmarcRecord.valid === 'valid' ? 'verified' : 'failed')
          : 'pending'; // Not all domains require DMARC for sending

        // Update database
        await storage.updateDomainAuth(domain.id, {
          spfStatus: spfStatus as any,
          dkimStatus: dkimStatus as any,
          dmarcStatus: dmarcStatus as any,
          lastCheckedAt: new Date()
        });

        console.log(`[MailgunSync] Synced ${domain.domain}: SPF=${spfStatus}, DKIM=${dkimStatus}, DMARC=${dmarcStatus}`);
        
        // Update sender profiles using this domain
        await this.updateSenderProfilesForDomain(domain.id, spfStatus === 'verified' && dkimStatus === 'verified');
        
        synced++;
      } catch (error) {
        console.error(`[MailgunSync] Error syncing domain ${domain.domain}:`, error);
        errors++;
      }
    }

    console.log(`[MailgunSync] Sync complete - Synced: ${synced}, Errors: ${errors}`);
    return { synced, errors };
  }

  /**
   * Update sender profiles when domain verification changes
   */
  private async updateSenderProfilesForDomain(domainAuthId: number, isVerified: boolean): Promise<void> {
    try {
      const profiles = await storage.getSenderProfiles();
      const profilesToUpdate = profiles.filter(p => p.domainAuthId === domainAuthId);

      for (const profile of profilesToUpdate) {
        await storage.updateSenderProfile(profile.id, {
          isVerified
        });
        console.log(`[MailgunSync] Updated sender profile ${profile.name} verification: ${isVerified}`);
      }
    } catch (error) {
      console.error('[MailgunSync] Error updating sender profiles:', error);
    }
  }

  /**
   * Sync single domain
   */
  async syncDomain(domainId: number): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const domain = await storage.getDomainAuth(domainId);
      if (!domain) {
        console.error(`[MailgunSync] Domain ${domainId} not found`);
        return false;
      }

      const mailgunData = await this.getDomainFromMailgun(domain.domain);
      if (!mailgunData) {
        return false;
      }

      const sendingRecords = mailgunData.sending_dns_records;
      
      // SPF: TXT record for domain
      const spfRecord = sendingRecords.find(r => 
        r.record_type === 'TXT' && 
        r.name === domain.domain &&
        r.value.includes('spf')
      );
      
      // DKIM: Can be TXT or CNAME records containing "_domainkey"
      const dkimRecords = sendingRecords.filter(r => 
        r.name.includes('_domainkey') &&
        (r.record_type === 'TXT' || r.record_type === 'CNAME')
      );
      
      // DMARC: TXT record for _dmarc subdomain (not always in Mailgun API)
      const dmarcRecord = sendingRecords.find(r => 
        r.record_type === 'TXT' && 
        r.name === `_dmarc.${domain.domain}`
      );

      // Determine status
      const spfStatus = spfRecord?.valid === 'valid' ? 'verified' : 'failed';
      
      // For DKIM, check if at least one DKIM record is valid
      const dkimStatus = dkimRecords.length > 0 && dkimRecords.some(r => r.valid === 'valid') 
        ? 'verified' 
        : 'failed';
      
      // For DMARC, mark as verified if record exists and is valid, otherwise 'pending'
      const dmarcStatus = dmarcRecord 
        ? (dmarcRecord.valid === 'valid' ? 'verified' : 'failed')
        : 'pending';

      await storage.updateDomainAuth(domain.id, {
        spfStatus: spfStatus as any,
        dkimStatus: dkimStatus as any,
        dmarcStatus: dmarcStatus as any,
        lastCheckedAt: new Date()
      });

      await this.updateSenderProfilesForDomain(domain.id, spfStatus === 'verified' && dkimStatus === 'verified');

      return true;
    } catch (error) {
      console.error(`[MailgunSync] Error syncing domain ${domainId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const mailgunSync = new MailgunSyncService();
