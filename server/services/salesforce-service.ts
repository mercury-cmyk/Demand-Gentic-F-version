// File: server/services/salesforce-service.ts
// Salesforce CRM Integration

interface SalesforceConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

interface SalesforceContact {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  customFields?: Record<string, any>;
}

interface SalesforceTask {
  id: string;
  subject: string;
  description?: string;
  dueDate?: string;
  priority?: 'High' | 'Normal' | 'Low';
  status?: string;
  whoId?: string; // Contact/Lead ID
}

class SalesforceService {
  private config: SalesforceConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /**
   * Initialize Salesforce service with credentials
   */
  configure(config: SalesforceConfig): void {
    this.config = config;
  }

  /**
   * Get or refresh access token
   */
  private async getAccessToken(): Promise<string> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    // Check if token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(
        `${this.config.instanceUrl}/services/oauth2/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            username: this.config.username,
            password: this.config.password,
          }).toString(),
        }
      );

      if (!response.ok) {
        throw new Error(`Salesforce OAuth error: ${response.status}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

      return this.accessToken;
    } catch (error: any) {
      console.error('Failed to get Salesforce access token:', error.message);
      throw error;
    }
  }

  /**
   * Create or update lead in Salesforce
   */
  async syncLead(contact: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
    customFields?: Record<string, any>;
  }): Promise<SalesforceContact> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    try {
      const token = await this.getAccessToken();

      // Try to find existing lead by email
      const existingLead = await this.findLeadByEmail(contact.email);
      if (existingLead) {
        return await this.updateLead(existingLead.id, contact);
      }

      // Create new lead
      const body = {
        LastName: contact.lastName || 'Unknown',
        FirstName: contact.firstName || '',
        Email: contact.email,
        Phone: contact.phone,
        Company: contact.company || 'Unknown Company',
        ...contact.customFields,
      };

      const response = await fetch(
        `${this.config.instanceUrl}/services/data/v57.0/sobjects/Lead`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error(`Salesforce API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        company: contact.company,
      };
    } catch (error: any) {
      console.error('Failed to sync lead to Salesforce:', error.message);
      throw error;
    }
  }

  /**
   * Find lead by email
   */
  private async findLeadByEmail(email: string): Promise<SalesforceContact | null> {
    if (!this.config || !this.accessToken) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.config.instanceUrl}/services/data/v57.0/query?q=SELECT+Id,Email,FirstName,LastName,Phone,Company+FROM+Lead+WHERE+Email='${encodeURIComponent(email)}'`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Salesforce API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.records && data.records.length > 0) {
        const record = data.records[0];
        return {
          id: record.Id,
          email: record.Email,
          firstName: record.FirstName,
          lastName: record.LastName,
          phone: record.Phone,
          company: record.Company,
        };
      }

      return null;
    } catch (error: any) {
      console.error('Failed to find lead in Salesforce:', error.message);
      return null;
    }
  }

  /**
   * Update lead in Salesforce
   */
  private async updateLead(
    leadId: string,
    contact: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
      customFields?: Record<string, any>;
    }
  ): Promise<SalesforceContact> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    try {
      const token = await this.getAccessToken();

      const body = {
        ...(contact.firstName ? { FirstName: contact.firstName } : {}),
        ...(contact.lastName ? { LastName: contact.lastName } : {}),
        ...(contact.phone ? { Phone: contact.phone } : {}),
        ...(contact.company ? { Company: contact.company } : {}),
        ...contact.customFields,
      };

      const response = await fetch(
        `${this.config.instanceUrl}/services/data/v57.0/sobjects/Lead/${leadId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error(`Salesforce API error: ${response.status}`);
      }

      return {
        id: leadId,
        email: contact.firstName,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        company: contact.company,
      };
    } catch (error: any) {
      console.error('Failed to update lead in Salesforce:', error.message);
      throw error;
    }
  }

  /**
   * Create task in Salesforce
   */
  async createTask(task: {
    subject: string;
    description?: string;
    dueDate?: string;
    priority?: 'High' | 'Normal' | 'Low';
    status?: string;
    leadId?: string;
  }): Promise<SalesforceTask> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    try {
      const token = await this.getAccessToken();

      const body = {
        Subject: task.subject,
        Description: task.description,
        ActivityDate: task.dueDate,
        Priority: task.priority || 'Normal',
        Status: task.status || 'Open',
        WhoId: task.leadId,
      };

      const response = await fetch(
        `${this.config.instanceUrl}/services/data/v57.0/sobjects/Task`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error(`Salesforce API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        subject: task.subject,
        description: task.description,
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        whoId: task.leadId,
      };
    } catch (error: any) {
      console.error('Failed to create task in Salesforce:', error.message);
      throw error;
    }
  }

  /**
   * Log campaign engagement to Salesforce
   */
  async logCampaignEngagement(
    leadId: string,
    engagementType: 'email_sent' | 'email_opened' | 'email_clicked',
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    try {
      const token = await this.getAccessToken();

      // Create task for engagement
      const taskSubject = `Campaign: ${engagementType.replace(/_/g, ' ')}`;
      const description = `Event: ${engagementType}\nMetadata: ${JSON.stringify(metadata)}`;

      const body = {
        Subject: taskSubject,
        Description: description,
        WhoId: leadId,
        Status: 'Completed',
      };

      const response = await fetch(
        `${this.config.instanceUrl}/services/data/v57.0/sobjects/Task`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        console.warn(
          `Failed to log engagement to Salesforce: ${response.status}`
        );
        return;
      }

      console.log(
        `✓ Engagement logged to Salesforce: ${engagementType} for lead ${leadId}`
      );
    } catch (error: any) {
      console.error('Failed to log engagement to Salesforce:', error.message);
    }
  }

  /**
   * Get lead details from Salesforce
   */
  async getLead(leadId: string): Promise<SalesforceContact | null> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch(
        `${this.config.instanceUrl}/services/data/v57.0/sobjects/Lead/${leadId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Salesforce API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        id: data.Id,
        email: data.Email,
        firstName: data.FirstName,
        lastName: data.LastName,
        phone: data.Phone,
        company: data.Company,
      };
    } catch (error: any) {
      console.error('Failed to get lead from Salesforce:', error.message);
      return null;
    }
  }

  /**
   * Test connection to Salesforce
   */
  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new Error('Salesforce service not configured');
    }

    try {
      await this.getAccessToken();
      return true;
    } catch (error) {
      console.error('Salesforce connection test failed:', error);
      return false;
    }
  }

  /**
   * Batch sync contacts from campaign
   */
  async batchSyncLeads(
    contacts: Array<{
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
    }>
  ): Promise<{ successful: number; failed: number }> {
    let successful = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        await this.syncLead(contact);
        successful++;
      } catch (error) {
        console.error(`Failed to sync contact ${contact.email}:`, error);
        failed++;
      }
    }

    console.log(
      `Batch sync completed: ${successful} successful, ${failed} failed`
    );
    return { successful, failed };
  }
}

export const salesforceService = new SalesforceService();
export { SalesforceConfig, SalesforceContact, SalesforceTask };
