// File: server/services/hubspot-service.ts
// HubSpot CRM Integration

import { db } from '../db';

interface HubSpotConfig {
  accessToken: string;
  refreshToken?: string;
  portalId: string;
}

interface HubSpotContact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  customFields?: Record;
}

interface HubSpotDeal {
  id: string;
  dealname: string;
  dealstage: string;
  amount: number;
  closedate?: string;
  hubspot_owner_id?: string;
}

interface SyncMapping {
  campaignField: string;
  hubspotField: string;
  type: 'text' | 'number' | 'date' | 'email' | 'select';
}

class HubSpotService {
  private config: HubSpotConfig | null = null;
  private baseUrl = 'https://api.hubapi.com';
  private readonly API_VERSION = 'v3';

  /**
   * Initialize HubSpot service with API credentials
   */
  configure(config: HubSpotConfig): void {
    this.config = config;
  }

  /**
   * Create or update contact in HubSpot
   */
  async syncContact(contact: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    customFields?: Record;
  }): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      // Prepare properties
      const properties = [
        { property: 'email', value: contact.email },
        ...(contact.firstName
          ? [{ property: 'firstname', value: contact.firstName }]
          : []),
        ...(contact.lastName
          ? [{ property: 'lastname', value: contact.lastName }]
          : []),
        ...(contact.phone ? [{ property: 'phone', value: contact.phone }] : []),
      ];

      // Add custom fields
      if (contact.customFields) {
        for (const [key, value] of Object.entries(contact.customFields)) {
          properties.push({
            property: key,
            value: String(value),
          });
        }
      }

      // Call HubSpot API
      const response = await fetch(
        `${this.baseUrl}/crm/${this.API_VERSION}/objects/contacts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties }),
        }
      );

      if (!response.ok) {
        if (response.status === 409) {
          // Contact exists, update instead
          return await this.updateContact(contact.email, contact);
        }
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
      };
    } catch (error: any) {
      console.error('Failed to sync contact to HubSpot:', error.message);
      throw error;
    }
  }

  /**
   * Update contact in HubSpot
   */
  private async updateContact(
    email: string,
    contact: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      customFields?: Record;
    }
  ): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      // Get existing contact first
      const existingContact = await this.getContact(email);
      if (!existingContact) {
        throw new Error(`Contact ${email} not found`);
      }

      // Prepare properties
      const properties = [
        ...(contact.firstName
          ? [{ property: 'firstname', value: contact.firstName }]
          : []),
        ...(contact.lastName
          ? [{ property: 'lastname', value: contact.lastName }]
          : []),
        ...(contact.phone ? [{ property: 'phone', value: contact.phone }] : []),
      ];

      // Add custom fields
      if (contact.customFields) {
        for (const [key, value] of Object.entries(contact.customFields)) {
          properties.push({
            property: key,
            value: String(value),
          });
        }
      }

      const response = await fetch(
        `${this.baseUrl}/crm/${this.API_VERSION}/objects/contacts/${existingContact.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties }),
        }
      );

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      return existingContact;
    } catch (error: any) {
      console.error('Failed to update contact in HubSpot:', error.message);
      throw error;
    }
  }

  /**
   * Get contact from HubSpot
   */
  async getContact(email: string): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/crm/${this.API_VERSION}/objects/contacts?limit=1&q=${email}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const contact = data.results[0];
        return {
          id: contact.id,
          email: contact.properties.email?.value || email,
          firstName: contact.properties.firstname?.value,
          lastName: contact.properties.lastname?.value,
          phone: contact.properties.phone?.value,
        };
      }

      return null;
    } catch (error: any) {
      console.error('Failed to get contact from HubSpot:', error.message);
      return null;
    }
  }

  /**
   * Log campaign event to HubSpot (add to timeline)
   */
  async logCampaignEvent(
    email: string,
    eventType: 'email_sent' | 'email_opened' | 'email_clicked' | 'email_bounced',
    metadata: Record = {}
  ): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      const contact = await this.getContact(email);
      if (!contact) {
        console.warn(`Contact ${email} not found in HubSpot`);
        return;
      }

      // Map event types to HubSpot engagement types
      const engagementTypeMap: Record = {
        email_sent: 'email',
        email_opened: 'email',
        email_clicked: 'email',
        email_bounced: 'email',
      };

      const engagementType = engagementTypeMap[eventType];
      if (!engagementType) {
        console.warn(`Unknown event type: ${eventType}`);
        return;
      }

      // Create engagement
      const engagement = {
        engagement: {
          type: engagementType,
          timestamp: Date.now(),
          body: `${eventType.replace(/_/g, ' ')}: ${JSON.stringify(metadata)}`,
        },
        associations: {
          contactIds: [contact.id],
        },
        metadata: {
          to: email,
          subject: metadata.subject || 'Campaign Email',
          ...metadata,
        },
      };

      const response = await fetch(
        `${this.baseUrl}/crm/v3/objects/engagement`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(engagement),
        }
      );

      if (!response.ok) {
        console.warn(
          `Failed to log event to HubSpot: ${response.status} - ${eventType}`
        );
        return;
      }

      console.log(`✓ Event logged to HubSpot: ${eventType} for ${email}`);
    } catch (error: any) {
      console.error(
        `Failed to log campaign event to HubSpot: ${error.message}`
      );
    }
  }

  /**
   * Get contacts from HubSpot list
   */
  async getContactsFromList(listId: string): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      const contacts: HubSpotContact[] = [];
      let after = '';

      // Paginate through contacts
      do {
        const query = after ? `&after=${after}` : '';
        const response = await fetch(
          `${this.baseUrl}/crm/${this.API_VERSION}/objects/contacts?limit=100${query}&properties=email,firstname,lastname,phone`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.accessToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HubSpot API error: ${response.status}`);
        }

        const data = await response.json();
        for (const contact of data.results) {
          contacts.push({
            id: contact.id,
            email: contact.properties.email?.value,
            firstName: contact.properties.firstname?.value,
            lastName: contact.properties.lastname?.value,
            phone: contact.properties.phone?.value,
          });
        }

        after = data.paging?.next?.after || '';
      } while (after);

      return contacts;
    } catch (error: any) {
      console.error(
        'Failed to get contacts from HubSpot list:',
        error.message
      );
      return [];
    }
  }

  /**
   * Create deal in HubSpot
   */
  async createDeal(deal: {
    dealname: string;
    dealstage: string;
    amount: number;
    closedate?: string;
    contactIds?: string[];
  }): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      const properties = [
        { property: 'dealname', value: deal.dealname },
        { property: 'dealstage', value: deal.dealstage },
        { property: 'amount', value: String(deal.amount) },
        ...(deal.closedate
          ? [{ property: 'closedate', value: deal.closedate }]
          : []),
      ];

      const response = await fetch(
        `${this.baseUrl}/crm/${this.API_VERSION}/objects/deals`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties,
            associations: deal.contactIds
              ? deal.contactIds.map(id => ({
                  types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
                  id,
                }))
              : [],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        dealname: deal.dealname,
        dealstage: deal.dealstage,
        amount: deal.amount,
        closedate: deal.closedate,
      };
    } catch (error: any) {
      console.error('Failed to create deal in HubSpot:', error.message);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise {
    if (!this.config) {
      throw new Error('HubSpot service not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/crm/${this.API_VERSION}/objects/contacts?limit=1`, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('HubSpot connection test failed:', error);
      return false;
    }
  }
}

export const hubspotService = new HubSpotService();
export { HubSpotConfig, HubSpotContact, HubSpotDeal, SyncMapping };