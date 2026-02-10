/**
 * Hook: useClientOrgIntelligence
 * 
 * Fetches and manages the organization intelligence context for client portal users.
 * This context is critical for agentic order requests to understand:
 * - Who the client is (business profile)
 * - What the organization does (intelligence)
 * - Previous campaigns and their patterns
 * 
 * The AI uses this context to generate better campaign suggestions.
 */

import { useQuery } from '@tanstack/react-query';

export interface ClientBusinessProfile {
  id: string;
  legalBusinessName: string;
  dbaName?: string;
  addressLine1: string;
  city: string;
  state: string;
  country: string;
  website?: string;
  phone?: string;
  supportEmail?: string;
  logoUrl?: string;
}

export interface OrganizationIdentity {
  legalName?: string;
  description?: string;
  industry?: string;
  employees?: string;
  regions?: string[];
  foundedYear?: number;
}

export interface OrganizationOfferings {
  coreProducts?: string[];
  useCases?: string[];
  problemsSolved?: string[];
  differentiators?: string[];
}

export interface OrganizationICP {
  industries?: string[];
  personas?: Array<{
    title: string;
    painPoints?: string[];
    goals?: string[];
  }>;
  objections?: string[];
  companySize?: string;
}

export interface OrganizationPositioning {
  oneLiner?: string;
  valueProposition?: string;
  competitors?: string[];
  whyUs?: string[];
}

export interface OrganizationOutreach {
  emailAngles?: string[];
  callOpeners?: string[];
  objectionHandlers?: Array<{
    objection: string;
    response: string;
  }>;
}

export interface OrganizationIntelligence {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  logoUrl?: string;
  identity?: OrganizationIdentity;
  offerings?: OrganizationOfferings;
  icp?: OrganizationICP;
  positioning?: OrganizationPositioning;
  outreach?: OrganizationOutreach;
  compiledOrgContext?: string;
  updatedAt?: string;
}

export interface LinkedCampaign {
  id: string;
  name: string;
  status: string;
  type: string;
}

export interface ClientOrgIntelligenceData {
  businessProfile: ClientBusinessProfile | null;
  clientName: string;
  organization: OrganizationIntelligence | null;
  campaigns: LinkedCampaign[];
  isPrimary: boolean;
  hasIntelligence: boolean;
  needsSetup: boolean;
}

const getToken = () => localStorage.getItem('clientPortalToken');

async function fetchBusinessProfile(): Promise<{
  profile: ClientBusinessProfile | null;
  clientName: string;
  needsSetup: boolean;
}> {
  const res = await fetch('/api/client-portal/settings/business-profile', {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch business profile');
  }
  
  return res.json();
}

async function fetchOrgIntelligence(): Promise<{
  organization: OrganizationIntelligence | null;
  campaigns: LinkedCampaign[];
  isPrimary: boolean;
}> {
  const res = await fetch('/api/client-portal/settings/organization-intelligence', {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch organization intelligence');
  }
  
  return res.json();
}

export function useClientOrgIntelligence() {
  const businessProfileQuery = useQuery({
    queryKey: ['client-business-profile'],
    queryFn: fetchBusinessProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const orgIntelQuery = useQuery({
    queryKey: ['client-org-intelligence'],
    queryFn: fetchOrgIntelligence,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const isLoading = businessProfileQuery.isLoading || orgIntelQuery.isLoading;
  const error = businessProfileQuery.error || orgIntelQuery.error;

  const data: ClientOrgIntelligenceData = {
    businessProfile: businessProfileQuery.data?.profile ?? null,
    clientName: businessProfileQuery.data?.clientName ?? '',
    organization: orgIntelQuery.data?.organization ?? null,
    campaigns: orgIntelQuery.data?.campaigns ?? [],
    isPrimary: orgIntelQuery.data?.isPrimary ?? false,
    hasIntelligence: !!(orgIntelQuery.data?.organization?.identity || orgIntelQuery.data?.organization?.offerings),
    needsSetup: businessProfileQuery.data?.needsSetup ?? false,
  };

  // Build a summary context for AI consumption
  const buildContextSummary = (): string => {
    const parts: string[] = [];
    
    // Business profile context
    if (data.businessProfile) {
      parts.push(`Client: ${data.businessProfile.legalBusinessName}`);
      if (data.businessProfile.dbaName) {
        parts.push(`DBA: ${data.businessProfile.dbaName}`);
      }
      if (data.businessProfile.website) {
        parts.push(`Website: ${data.businessProfile.website}`);
      }
    } else if (data.clientName) {
      parts.push(`Client: ${data.clientName}`);
    }
    
    // Organization intelligence context
    const org = data.organization;
    if (org) {
      if (org.identity?.description) {
        parts.push(`\nAbout: ${org.identity.description}`);
      }
      if (org.identity?.industry) {
        parts.push(`Industry: ${org.identity.industry}`);
      }
      
      if (Array.isArray(org.offerings?.coreProducts) && org.offerings.coreProducts.length) {
        parts.push(`Products/Services: ${org.offerings.coreProducts.join(', ')}`);
      }
      if (Array.isArray(org.offerings?.problemsSolved) && org.offerings.problemsSolved.length) {
        parts.push(`Problems Solved: ${org.offerings.problemsSolved.join(', ')}`);
      }
      if (Array.isArray(org.offerings?.differentiators) && org.offerings.differentiators.length) {
        parts.push(`Key Differentiators: ${org.offerings.differentiators.join(', ')}`);
      }
      
      if (Array.isArray(org.icp?.industries) && org.icp.industries.length) {
        parts.push(`Target Industries: ${org.icp.industries.join(', ')}`);
      }
      if (Array.isArray(org.icp?.personas) && org.icp.personas.length) {
        const titles = org.icp.personas.map((p: any) => (typeof p === 'string' ? p : p.title)).join(', ');
        parts.push(`Target Personas: ${titles}`);
      }
      if (org.icp?.companySize) {
        parts.push(`Target Company Size: ${org.icp.companySize}`);
      }
      
      if (org.positioning?.oneLiner) {
        parts.push(`Value Prop: ${org.positioning.oneLiner}`);
      }
    }
    
    // Previous campaigns context
    if (data.campaigns.length > 0) {
      const campaignTypes = [...new Set(data.campaigns.map(c => c.type))];
      parts.push(`Previous Campaign Types: ${campaignTypes.join(', ')}`);
    }
    
    return parts.join('\n');
  };

  // Get ICP-based suggestions for targeting
  const getTargetingSuggestions = () => {
    const suggestions: {
      industries: string[];
      titles: string[];
      companySize?: string;
    } = {
      industries: [],
      titles: [],
    };

    const org = data.organization;
    if (org?.icp) {
      if (Array.isArray(org.icp.industries)) {
        suggestions.industries = org.icp.industries;
      }
      if (Array.isArray(org.icp.personas)) {
        suggestions.titles = org.icp.personas.map((p: any) => (typeof p === 'string' ? p : p.title));
      }
      if (org.icp.companySize) {
        suggestions.companySize = org.icp.companySize;
      }
    }

    return suggestions;
  };

  // Get value proposition for display
  const getValueProposition = (): string | null => {
    return data.organization?.positioning?.oneLiner ?? 
           data.organization?.positioning?.valueProposition ?? 
           null;
  };

  return {
    data,
    isLoading,
    error,
    buildContextSummary,
    getTargetingSuggestions,
    getValueProposition,
    refetch: () => {
      businessProfileQuery.refetch();
      orgIntelQuery.refetch();
    },
  };
}

export default useClientOrgIntelligence;
