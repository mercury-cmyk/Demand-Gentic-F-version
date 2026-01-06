import { storage } from "../storage";
import type { InsertSpeaker, InsertOrganizer, InsertSponsor } from "@shared/schema";

interface ResourcesCentreSpeaker {
  id: number;
  name: string;
  title?: string;
  company?: string;
  bio?: string;
  created_at: string;
  updated_at: string;
}

interface ResourcesCentreOrganizer {
  id: number;
  name: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

interface ResourcesCentreSponsor {
  id: number;
  name: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

interface SyncResult {
  success: boolean;
  speakers?: {
    created: number;
    updated: number;
    errors: number;
  };
  organizers?: {
    created: number;
    updated: number;
    errors: number;
  };
  sponsors?: {
    created: number;
    updated: number;
    errors: number;
  };
  errors?: string[];
}

export class ResourcesCentreSync {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.RESOURCES_CENTRE_URL || '';
    this.apiKey = process.env.RESOURCES_CENTRE_API_KEY || '';
  }

  private validateConfig(): void {
    if (!this.baseUrl) {
      throw new Error('RESOURCES_CENTRE_URL environment variable is not set');
    }
    if (!this.apiKey) {
      throw new Error('RESOURCES_CENTRE_API_KEY environment variable is not set');
    }
  }

  private async fetchFromResourcesCentre<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Debug logging
    console.log('Fetching from Resources Centre:', {
      url,
      apiKeyLength: this.apiKey?.length || 0,
      apiKeyPrefix: this.apiKey?.substring(0, 10) || 'none',
    });
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    console.log('Resources Centre response:', {
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key for Resources Centre');
      }
      throw new Error(`Resources Centre API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async syncSpeakers(): Promise<{ created: number; updated: number; errors: number }> {
    this.validateConfig();
    const result = { created: 0, updated: 0, errors: 0 };

    try {
      const response = await this.fetchFromResourcesCentre<{ data: ResourcesCentreSpeaker[] }>('/api/v1/speakers');
      const remoteSpeakers = response.data;

      // Get existing speakers
      const existingSpeakers = await storage.getSpeakers();

      for (const remoteSpeaker of remoteSpeakers) {
        try {
          const speakerData: InsertSpeaker = {
            externalId: String(remoteSpeaker.id),
            name: remoteSpeaker.name,
            title: remoteSpeaker.title || null,
            company: remoteSpeaker.company || null,
            bio: remoteSpeaker.bio || null,
          };

          const existing = existingSpeakers.find(s => s.externalId === String(remoteSpeaker.id));
          
          if (existing) {
            // Update if remote version is newer
            const remoteUpdated = new Date(remoteSpeaker.updated_at);
            const localUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
            
            if (remoteUpdated > localUpdated) {
              await storage.updateSpeaker(existing.id, speakerData);
              result.updated++;
            }
          } else {
            // Create new speaker
            await storage.createSpeaker(speakerData);
            result.created++;
          }
        } catch (error) {
          console.error(`Error syncing speaker ${remoteSpeaker.id}:`, error);
          result.errors++;
        }
      }
    } catch (error) {
      console.error('Error syncing speakers:', error);
      throw error;
    }

    return result;
  }

  async syncOrganizers(): Promise<{ created: number; updated: number; errors: number }> {
    this.validateConfig();
    const result = { created: 0, updated: 0, errors: 0 };

    try {
      const response = await this.fetchFromResourcesCentre<{ data: ResourcesCentreOrganizer[] }>('/api/v1/organizers');
      const remoteOrganizers = response.data;

      const existingOrganizers = await storage.getOrganizers();

      for (const remoteOrganizer of remoteOrganizers) {
        try {
          const organizerData: InsertOrganizer = {
            externalId: String(remoteOrganizer.id),
            name: remoteOrganizer.name,
            websiteUrl: remoteOrganizer.website || null,
          };

          const existing = existingOrganizers.find(o => o.externalId === String(remoteOrganizer.id));
          
          if (existing) {
            const remoteUpdated = new Date(remoteOrganizer.updated_at);
            const localUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
            
            if (remoteUpdated > localUpdated) {
              await storage.updateOrganizer(existing.id, organizerData);
              result.updated++;
            }
          } else {
            await storage.createOrganizer(organizerData);
            result.created++;
          }
        } catch (error) {
          console.error(`Error syncing organizer ${remoteOrganizer.id}:`, error);
          result.errors++;
        }
      }
    } catch (error) {
      console.error('Error syncing organizers:', error);
      throw error;
    }

    return result;
  }

  async syncSponsors(): Promise<{ created: number; updated: number; errors: number }> {
    this.validateConfig();
    const result = { created: 0, updated: 0, errors: 0 };

    try {
      const response = await this.fetchFromResourcesCentre<{ data: ResourcesCentreSponsor[] }>('/api/v1/sponsors');
      const remoteSponsors = response.data;

      const existingSponsors = await storage.getSponsors();

      for (const remoteSponsor of remoteSponsors) {
        try {
          const sponsorData: InsertSponsor = {
            externalId: String(remoteSponsor.id),
            name: remoteSponsor.name,
            websiteUrl: remoteSponsor.website || null,
          };

          const existing = existingSponsors.find(s => s.externalId === String(remoteSponsor.id));
          
          if (existing) {
            const remoteUpdated = new Date(remoteSponsor.updated_at);
            const localUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
            
            if (remoteUpdated > localUpdated) {
              await storage.updateSponsor(existing.id, sponsorData);
              result.updated++;
            }
          } else {
            await storage.createSponsor(sponsorData);
            result.created++;
          }
        } catch (error) {
          console.error(`Error syncing sponsor ${remoteSponsor.id}:`, error);
          result.errors++;
        }
      }
    } catch (error) {
      console.error('Error syncing sponsors:', error);
      throw error;
    }

    return result;
  }

  async syncAll(): Promise<SyncResult> {
    const errors: string[] = [];
    const result: SyncResult = { success: true };

    try {
      result.speakers = await this.syncSpeakers();
    } catch (error) {
      errors.push(`Speakers sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.speakers = { created: 0, updated: 0, errors: 1 };
    }

    try {
      result.organizers = await this.syncOrganizers();
    } catch (error) {
      errors.push(`Organizers sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.organizers = { created: 0, updated: 0, errors: 1 };
    }

    try {
      result.sponsors = await this.syncSponsors();
    } catch (error) {
      errors.push(`Sponsors sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.sponsors = { created: 0, updated: 0, errors: 1 };
    }

    if (errors.length > 0) {
      result.success = false;
      result.errors = errors;
    }

    return result;
  }
}

export const resourcesCentreSync = new ResourcesCentreSync();
