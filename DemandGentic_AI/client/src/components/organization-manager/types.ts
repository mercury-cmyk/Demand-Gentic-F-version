export interface Organization {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  logoUrl: string | null;
  organizationType: 'super' | 'client' | 'campaign';
  parentOrganizationId: string | null;
  isCampaignOrg: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  createdBy: string | null;
  memberCount?: number;
  identity?: any;
  offerings?: any;
  icp?: any;
  positioning?: any;
  outreach?: any;
  compiledOrgContext?: string | null;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  invitedBy: string | null;
  joinedAt: string;
  updatedAt: string | null;
  user: {
    id: string;
    username: string;
    email: string | null;
  };
}

export interface OrganizationStats {
  total: number;
  active: number;
  inactive: number;
  byType: {
    super: number;
    client: number;
    campaign: number;
  };
  recentlyCreated: number;
}