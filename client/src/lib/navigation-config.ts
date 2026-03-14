/**
 * Navigation Configuration
 *
 * Centralized navigation structure organized by domain-bounded contexts.
 * This file defines all navigation items, their routes, roles, and domain groupings.
 */

// Domain identifiers for bounded contexts
export const NAVIGATION_DOMAINS = {
  AI_INTELLIGENCE: 'ai-intelligence',
  CORE_CRM: 'core-crm',
  CAMPAIGNS: 'campaigns',
  QUALITY_CONTROL: 'quality-control',
  ANALYTICS: 'analytics',
  OPERATIONS: 'operations',
  IAM: 'iam',
  SETTINGS: 'settings',
} as const;

export type NavigationDomain = typeof NAVIGATION_DOMAINS[keyof typeof NAVIGATION_DOMAINS];

// Badge variants for highlighting items
export type BadgeVariant = 'new' | 'beta' | 'deprecated' | 'updated';

export interface NavigationBadge {
  text: string;
  variant: BadgeVariant;
}

// Sub-navigation item (nested under a parent)
export interface SubNavItem {
  id: string;
  title: string;
  url: string;
  roles: string[];
  badge?: NavigationBadge;
  description?: string;
}

// Main navigation item
export interface NavItem {
  id: string;
  title: string;
  url?: string;
  icon: string; // Icon name as string (resolved at runtime)
  roles: string[];
  items?: SubNavItem[];
  badge?: NavigationBadge;
  description?: string;
}

// Navigation section (domain grouping)
export interface NavSection {
  id: string;
  label: string;
  domain: NavigationDomain;
  items: NavItem[];
  roles: string[];
  collapsedByDefault?: boolean;
  description?: string;
}

// All available user roles
export const USER_ROLES = {
  ADMIN: 'admin',
  CAMPAIGN_MANAGER: 'campaign_manager',
  DATA_OPS: 'data_ops',
  QUALITY_ANALYST: 'quality_analyst',
  AGENT: 'agent',
  CLIENT_USER: 'client_user',
  VOICE_TRAINER: 'voice_trainer',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Role groups for common access patterns
const ALL_ROLES: string[] = Object.values(USER_ROLES);
const MANAGEMENT_ROLES: string[] = [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER];
const DATA_ROLES: string[] = [USER_ROLES.ADMIN, USER_ROLES.DATA_OPS];
const QA_ROLES: string[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.CAMPAIGN_MANAGER,
  USER_ROLES.QUALITY_ANALYST,
  'manager',
  'qa_analyst',
];
const VOICE_TRAINING_ROLES: string[] = [...QA_ROLES, USER_ROLES.VOICE_TRAINER];

/**
 * Main navigation configuration
 * Organized by domain-bounded contexts
 */
export const NAVIGATION_SECTIONS: NavSection[] = [
  // ============================================
  // AI & INTELLIGENCE DOMAIN
  // ============================================
  {
    id: 'ai-intelligence',
    label: 'AI & Intelligence',
    domain: NAVIGATION_DOMAINS.AI_INTELLIGENCE,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER, USER_ROLES.QUALITY_ANALYST, USER_ROLES.VOICE_TRAINER],
    description: 'AI agents, organization intelligence, and prompt configuration',
    items: [
      {
        id: 'ai-studio',
        title: 'AI Studio',
        icon: 'Sparkles',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER, USER_ROLES.QUALITY_ANALYST, USER_ROLES.VOICE_TRAINER],
        items: [
          {
            id: 'ai-dashboard',
            title: 'Intelligence Dashboard',
            url: '/ai-studio',
            roles: MANAGEMENT_ROLES,
            badge: { text: 'New', variant: 'new' },
            description: 'Overview of all AI configurations',
          },
          {
            id: 'org-intelligence',
            title: 'Organization Intelligence',
            url: '/ai-studio/intelligence',
            roles: MANAGEMENT_ROLES,
            description: 'Configure organization context and service catalog',
          },
          {
            id: 'foundational-agents',
            title: 'Foundational Agents',
            url: '/unified-agent-architecture',
            roles: MANAGEMENT_ROLES,
            badge: { text: 'New', variant: 'new' as BadgeVariant },
            description: 'Unified agent architecture — prompt sections, capabilities, learning pipeline',
          },
          {
            id: 'preview-studio',
            title: 'Preview Studio',
            url: '/preview-studio',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
            description: 'Test and preview AI agent behavior',
          },
          {
            id: 'voice-agent-training',
            title: 'Voice Agent Training',
            url: '/voice-agent-training',
            roles: VOICE_TRAINING_ROLES,
            badge: { text: 'New', variant: 'new' },
            description: 'Draft, simulate, and publish unified voice prompt modules safely',
          },
          {
            id: 'agentic-operator',
            title: 'Agentic Demand Council',
            url: '/ai-studio/operator',
            roles: MANAGEMENT_ROLES,
            description: 'Unified agentic operations panel',
          },
          // Agent Prompts moved inside Unified Agent Architecture (AgentX)
          {
            id: 'campaign-manager',
            title: 'Campaign Manager',
            url: '/ai-studio/campaign-manager',
            roles: MANAGEMENT_ROLES,
            badge: { text: 'New', variant: 'new' as BadgeVariant },
            description: 'AI quarterly planning, approvals, and channel orchestration',
          },
        ],
      },
      {
        id: 'generative-studio',
        title: 'Creative Studio',
        url: '/generative-studio',
        icon: 'Wand2',
        roles: MANAGEMENT_ROLES,
        badge: { text: 'New', variant: 'new' as BadgeVariant },
        description: 'AI-powered content creation hub for images, pages, emails, blogs, and more',
      },
    ],
  },

  // ============================================
  // CORE CRM DOMAIN
  // ============================================
  {
    id: 'core-crm',
    label: 'Core CRM',
    domain: NAVIGATION_DOMAINS.CORE_CRM,
    roles: ALL_ROLES,
    description: 'Accounts, contacts, pipeline, and core CRM functionality',
    items: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: 'LayoutDashboard',
        roles: ALL_ROLES,
        items: [
          {
            id: 'overview',
            title: 'Overview',
            url: '/',
            roles: ALL_ROLES,
          },
          {
            id: 'bookings',
            title: 'Bookings',
            url: '/admin/bookings',
            roles: MANAGEMENT_ROLES,
            badge: { text: "New", variant: "new" }
          },
        ],
      },
      {
        id: 'revenue-pipeline',
        title: 'Revenue & Pipeline',
        icon: 'KanbanSquare',
        roles: MANAGEMENT_ROLES,
        items: [
          {
            id: 'pipeline',
            title: 'Pipeline',
            url: '/pipeline',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'import-opportunities',
            title: 'Import Opportunities',
            url: '/pipeline/import',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
          },
          {
            id: 'revenue-inbox',
            title: 'Revenue Inbox',
            url: '/inbox',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'email-sequences',
            title: 'Email Sequences',
            url: '/email-sequences',
            roles: MANAGEMENT_ROLES,
          },
        ],
      },
    ],
  },

  // ============================================
  // CAMPAIGNS DOMAIN (UNIFIED)
  // ============================================
  {
    id: 'campaigns',
    label: 'Campaigns & Execution',
    domain: NAVIGATION_DOMAINS.CAMPAIGNS,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.AGENT, USER_ROLES.CLIENT_USER],
    description: 'Campaign management, agent console, and lead review',
    items: [
      {
        id: 'campaigns-hub',
        title: 'Campaigns',
        url: '/campaigns',
        icon: 'Megaphone',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
        description: 'Unified campaign management for email and phone',
      },
      {
        id: 'agent-console',
        title: 'Agent Console',
        url: '/agent-console',
        icon: 'Headphones',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.AGENT],
        description: 'Dialer and call execution interface',
      },
      {
        id: 'content-promotion',
        title: 'Content Promotion',
        url: '/content-promotion',
        icon: 'PanelTop',
        roles: MANAGEMENT_ROLES,
        badge: { text: 'New', variant: 'new' as BadgeVariant },
        description: 'Create and manage content promotion landing pages',
      },
    ],
  },

  // ============================================
  // QUALITY CONTROL CENTER
  // ============================================
  {
    id: 'quality-control',
    label: 'Quality Control Center',
    domain: NAVIGATION_DOMAINS.QUALITY_CONTROL,
    roles: [...QA_ROLES, USER_ROLES.AGENT],
    description: 'Unified quality control, data integrity, and lead review',
    items: [
      {
        id: 'disposition-intelligence',
        title: 'Disposition Intelligence',
        icon: 'BarChart3',
        roles: [...QA_ROLES, USER_ROLES.AGENT],
        description: 'Central hub for disposition intelligence, conversation quality, showcase calls, and reanalysis',
        badge: { text: 'Updated', variant: 'updated' },
        items: [
          {
            id: 'disposition-overview',
            title: 'Disposition Overview',
            url: '/disposition-intelligence',
            roles: QA_ROLES,
            description: 'Disposition intelligence dashboard',
          },
          {
            id: 'conversation-quality',
            title: 'Conversation Quality',
            url: '/disposition-intelligence?tab=conversation-quality',
            roles: QA_ROLES,
            description: 'Conversation quality analysis and scoring',
          },
          {
            id: 'showcase-calls',
            title: 'Showcase Calls',
            url: '/disposition-intelligence?tab=showcase-calls',
            roles: [...QA_ROLES, USER_ROLES.CLIENT_USER, USER_ROLES.AGENT],
            description: 'Top meaningful call conversations with recordings, transcript, issues, and recommendations',
          },
          {
            id: 'transcription-health',
            title: 'Transcription Health',
            url: '/disposition-intelligence?tab=transcription-health',
            roles: QA_ROLES,
            description: 'Track transcription coverage, identify gaps, and regenerate missing transcripts',
          },
          {
            id: 'reanalysis',
            title: 'Reanalysis',
            url: '/disposition-intelligence?tab=reanalysis',
            roles: QA_ROLES,
            description: 'Deep AI reanalysis for disposition corrections',
          },
          {
            id: 'potential-leads',
            title: 'Potential Leads',
            url: '/disposition-intelligence/potential-leads',
            roles: QA_ROLES,
            description: 'AI-identified leads with qualification signals',
          },
        ],
      },
      {
        id: 'qa-lead-review',
        title: 'QA & Lead Review',
        url: '/leads',
        icon: 'CheckCircle',
        roles: [...QA_ROLES, USER_ROLES.AGENT],
        description: 'Review and qualify leads',
      },
      {
        id: 'qa-review-center',
        title: 'QA Review Center',
        url: '/qa-review-center',
        icon: 'ShieldCheck',
        roles: QA_ROLES,
        description: 'Review and approve QA-gated content',
      },
    ],
  },

  // ============================================
  // ANALYTICS DOMAIN
  // ============================================
  {
    id: 'analytics',
    label: 'Analytics & Insights',
    domain: NAVIGATION_DOMAINS.ANALYTICS,
    roles: [...QA_ROLES, USER_ROLES.CLIENT_USER],
    description: 'Campaign analytics, call reports, and performance insights',
    items: [
      {
        id: 'engagement-analytics',
        title: 'Analytics',
        url: '/engagement-analytics',
        icon: 'BarChart3',
        roles: [...QA_ROLES, USER_ROLES.CLIENT_USER],
        description: 'Campaign engagement metrics',
      },
      {
        id: 'call-reports',
        title: 'Call Reports',
        url: '/call-reports',
        icon: 'FileText',
        roles: [...QA_ROLES, USER_ROLES.CLIENT_USER],
        description: 'Call disposition reports, agent performance, and AI call analytics',
      },
    ],
  },

  // ============================================
  // OPERATIONS DOMAIN
  // ============================================
  {
    id: 'operations',
    label: 'Projects & Operations',
    domain: NAVIGATION_DOMAINS.OPERATIONS,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER, USER_ROLES.DATA_OPS, USER_ROLES.QUALITY_ANALYST, USER_ROLES.AGENT],
    description: 'Project management and operational workflows',
    items: [
      {
        id: 'project-management',
        title: 'Project Management',
        icon: 'FolderKanban',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS, USER_ROLES.QUALITY_ANALYST, USER_ROLES.AGENT],
        description: 'Project requests, task board, and PM review',
        items: [
          {
            id: 'project-requests',
            title: 'Project Requests',
            url: '/admin/project-requests',
            roles: MANAGEMENT_ROLES,
            description: 'Review and approve client project requests',
            badge: { text: 'New', variant: 'new' },
          },
          {
            id: 'todo-board',
            title: 'Strategic Tasks',
            url: '/admin/todo-board',
            roles: [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER, USER_ROLES.DATA_OPS, USER_ROLES.QUALITY_ANALYST, USER_ROLES.AGENT],
            description: 'AI-powered issue detection, prioritization, and role-aware task assignment',
          },
          {
            id: 'pm-review',
            title: 'PM Review',
            url: '/leads?tab=pm-review',
            roles: MANAGEMENT_ROLES,
            description: 'Review QA-approved leads before client delivery',
          },
        ],
      },
      {
        id: 'finance-program',
        title: 'Finance & Programs',
        url: '/finance-program',
        icon: 'Briefcase',
        roles: [USER_ROLES.ADMIN],
        badge: { text: 'New', variant: 'new' as BadgeVariant },
        description: 'Accelerator readiness, funding goals, budget tracking, and milestone management',
      },
      {
        id: 'administration',
        title: 'Administration',
        icon: 'Building',
        roles: [USER_ROLES.ADMIN],
        description: 'Organization and client management',
        items: [
          {
            id: 'organization-manager',
            title: 'Organizations',
            url: '/organization-manager',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage super, client, and campaign organizations',
          },
          {
            id: 'client-management',
            title: 'Client Management',
            url: '/client-portal-admin',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage clients, client users, and portal access',
          },
        ],
      },
      {
        id: 'data-management',
        title: 'Data Management',
        icon: 'Database',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
        description: 'Accounts, contacts, segments, and data operations',
        items: [
          {
            id: 'data-management-hub',
            title: 'Data Hub',
            url: '/data-management',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage data uploads, quality, templates, and requests',
          },
          {
            id: 'all-accounts',
            title: 'Accounts',
            url: '/accounts',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
          },
          {
            id: 'target-accounts',
            title: 'Target Accounts (TAL)',
            url: '/domain-sets',
            roles: [USER_ROLES.ADMIN, USER_ROLES.DATA_OPS],
          },
          {
            id: 'account-segments',
            title: 'Account Segments & Lists',
            url: '/segments?entity=account',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
          },
          {
            id: 'all-contacts',
            title: 'Contacts',
            url: '/contacts',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
          },
          {
            id: 'contact-segments',
            title: 'Contact Segments & Lists',
            url: '/segments?entity=contact',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
          },
          {
            id: 'lead-forms',
            title: 'Lead Forms',
            url: '/lead-forms',
            roles: MANAGEMENT_ROLES,
            description: 'Lead capture forms',
          },
        ],
      },
    ],
  },

  // ============================================
  // IAM - IDENTITY & ACCESS MANAGEMENT
  // ============================================
  {
    id: 'iam',
    label: 'Access Control',
    domain: NAVIGATION_DOMAINS.IAM,
    roles: [USER_ROLES.ADMIN],
    description: 'Identity & access management, permissions, and audit',
    items: [
      {
        id: 'iam-hub',
        title: 'IAM',
        icon: 'ShieldCheck',
        roles: [USER_ROLES.ADMIN],
        items: [
          {
            id: 'iam-overview',
            title: 'Overview',
            url: '/iam',
            roles: [USER_ROLES.ADMIN],
            description: 'IAM dashboard and quick actions',
          },
          {
            id: 'iam-users',
            title: 'Users',
            url: '/iam/users',
            roles: [USER_ROLES.ADMIN],
            description: 'User access management',
          },
          {
            id: 'iam-teams',
            title: 'Teams',
            url: '/iam/teams',
            roles: [USER_ROLES.ADMIN],
            description: 'Team management',
          },
          {
            id: 'iam-roles',
            title: 'Roles',
            url: '/iam/roles',
            roles: [USER_ROLES.ADMIN],
            description: 'Role configuration',
          },
          {
            id: 'iam-policies',
            title: 'Policies',
            url: '/iam/policies',
            roles: [USER_ROLES.ADMIN],
            description: 'Permission policies',
          },
          {
            id: 'iam-grants',
            title: 'Access Grants',
            url: '/iam/grants',
            roles: [USER_ROLES.ADMIN],
            description: 'Direct access grants',
          },
          {
            id: 'iam-requests',
            title: 'Access Requests',
            url: '/iam/requests',
            roles: ALL_ROLES,
            description: 'Request and approve access',
          },
          {
            id: 'iam-audit',
            title: 'Audit Log',
            url: '/iam/audit',
            roles: [USER_ROLES.ADMIN],
            description: 'IAM audit trail',
          },
          {
            id: 'iam-secrets',
            title: 'Secrets',
            url: '/iam/secrets',
            roles: [USER_ROLES.ADMIN],
            description: 'Central secret manager',
          },
          {
            id: 'iam-client-access',
            title: 'Client Access',
            url: '/iam/client-access',
            roles: [USER_ROLES.ADMIN],
            description: 'Per-client feature permissions',
          },
        ],
      },
    ],
  },

  // ============================================
  // SETTINGS DOMAIN
  // ============================================
  {
    id: 'settings',
    label: 'Settings',
    domain: NAVIGATION_DOMAINS.SETTINGS,
    roles: [USER_ROLES.ADMIN],
    collapsedByDefault: true,
    description: 'System configuration and administration',
    items: [
      {
        id: 'settings-general',
        title: 'General',
        icon: 'Settings',
        roles: [USER_ROLES.ADMIN],
        description: 'Profile, users, integrations, and platform',
        items: [
          {
            id: 'settings-profile',
            title: 'Profile',
            url: '/settings/profile',
            roles: ALL_ROLES,
          },
          {
            id: 'settings-users',
            title: 'Users & Roles',
            url: '/settings/users',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'settings-integrations',
            title: 'Integrations',
            url: '/settings/integrations',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'settings-platform',
            title: 'Platform Admin',
            url: '/settings/super-org',
            roles: [USER_ROLES.ADMIN],
            description: 'Super organization management',
          },
          {
            id: 'settings-cloud-logs',
            title: 'System Logs',
            url: '/cloud-logs',
            roles: [USER_ROLES.ADMIN],
            description: 'Monitor API, media bridge, and SIP server logs',
          },
        ],
      },
      {
        id: 'settings-telephony-group',
        title: 'Telephony',
        icon: 'Phone',
        roles: [USER_ROLES.ADMIN],
        description: 'SIP, number pool, and voice settings',
        items: [
          {
            id: 'settings-telephony',
            title: 'Telephony (SIP)',
            url: '/settings/telephony',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'settings-number-pool',
            title: 'Number Pool',
            url: '/number-pool',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage Telnyx phone numbers for AI calling',
          },
        ],
      },
      {
        id: 'settings-ai-group',
        title: 'AI Configuration',
        icon: 'Bot',
        roles: [USER_ROLES.ADMIN],
        description: 'Agent defaults, knowledge hub, and prompt management',
        items: [
          {
            id: 'settings-agent-defaults',
            title: 'Agent Defaults',
            url: '/settings/agent-defaults',
            roles: [USER_ROLES.ADMIN],
            description: 'Configure default AI agent settings',
          },
          {
            id: 'settings-ai-governance',
            title: 'AI Governance',
            url: '/settings/ai-governance',
            roles: [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER],
            description: 'Govern providers and models by task',
          },
          {
            id: 'settings-prompts',
            title: 'Prompt Management',
            url: '/settings/prompts',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage AI prompts, versions, and performance analytics',
            badge: { text: 'New', variant: 'new' },
          },
        ],
      },
      {
        id: 'settings-email-group',
        title: 'Email & Messaging',
        icon: 'Mail',
        roles: [USER_ROLES.ADMIN],
        description: 'SMTP, templates, domains, deliverability, and branding',
        items: [
          {
            id: 'settings-mercury-notifications',
            title: 'Mercury & Transactional',
            url: '/settings/mercury-notifications',
            roles: [USER_ROLES.ADMIN],
            description: 'SMTP providers, transactional templates, and Mercury notification rules',
          },
          {
            id: 'settings-email-management',
            title: 'Campaign Email',
            url: '/settings/email-management',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage campaign providers, sender profiles, and sending domains',
          },
          {
            id: 'settings-deliverability',
            title: 'Deliverability',
            url: '/settings/deliverability',
            roles: [USER_ROLES.ADMIN],
            description: 'Monitor email deliverability and blacklists',
          },
          {
            id: 'settings-brand-kits',
            title: 'Brand Kits',
            url: '/settings/brand-kits',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage brand colors, fonts, and styles for emails',
          },
          {
            id: 'settings-email-builder',
            title: 'Email Builder',
            url: '/email-builder',
            roles: [USER_ROLES.ADMIN],
            description: 'Build emails with drag-and-drop blocks',
          },
        ],
      },
    ],
  },
];

/**
 * Filter navigation sections based on user roles
 */
export function filterSectionsByRoles(sections: NavSection[], userRoles: string[]): NavSection[] {
  // Admin sees everything
  if (userRoles.includes(USER_ROLES.ADMIN)) {
    return sections;
  }

  return sections
    .filter(section => section.roles.some(role => userRoles.includes(role)))
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => item.roles.some(role => userRoles.includes(role)))
        .map(item => ({
          ...item,
          items: item.items?.filter(subItem =>
            subItem.roles.some(role => userRoles.includes(role))
          ),
        })),
    }))
    .filter(section => section.items.length > 0);
}

/**
 * Get items that should display spotlight badges
 */
export function getSpotlightItems(): Set<string> {
  const spotlightItems = new Set<string>();

  for (const section of NAVIGATION_SECTIONS) {
    for (const item of section.items) {
      if (item.badge?.variant === 'new') {
        spotlightItems.add(item.title);
      }
      if (item.items) {
        for (const subItem of item.items) {
          if (subItem.badge?.variant === 'new') {
            spotlightItems.add(subItem.title);
          }
        }
      }
    }
  }

  return spotlightItems;
}

/**
 * Find a navigation item by its URL
 */
export function findNavItemByUrl(url: string): NavItem | SubNavItem | undefined {
  for (const section of NAVIGATION_SECTIONS) {
    for (const item of section.items) {
      if (item.url === url) return item;
      if (item.items) {
        const subItem = item.items.find(sub => sub.url === url);
        if (subItem) return subItem;
      }
    }
  }
  return undefined;
}

/**
 * Get breadcrumb trail for a given URL
 */
export function getBreadcrumbTrail(url: string): Array<{ title: string; url?: string }> {
  const trail: Array<{ title: string; url?: string }> = [];

  for (const section of NAVIGATION_SECTIONS) {
    for (const item of section.items) {
      if (item.url === url) {
        trail.push({ title: section.label });
        trail.push({ title: item.title, url: item.url });
        return trail;
      }
      if (item.items) {
        const subItem = item.items.find(sub => sub.url === url);
        if (subItem) {
          trail.push({ title: section.label });
          trail.push({ title: item.title });
          trail.push({ title: subItem.title, url: subItem.url });
          return trail;
        }
      }
    }
  }

  return trail;
}
