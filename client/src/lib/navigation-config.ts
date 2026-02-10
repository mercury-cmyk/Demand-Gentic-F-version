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
  DATA_VERIFICATION: 'data-verification',
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
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Role groups for common access patterns
const ALL_ROLES: string[] = Object.values(USER_ROLES);
const MANAGEMENT_ROLES: string[] = [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER];
const DATA_ROLES: string[] = [USER_ROLES.ADMIN, USER_ROLES.DATA_OPS];
const QA_ROLES: string[] = [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER, USER_ROLES.QUALITY_ANALYST];

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
    roles: MANAGEMENT_ROLES,
    description: 'AI agents, organization intelligence, and prompt configuration',
    items: [
      {
        id: 'ai-studio',
        title: 'AI Studio',
        icon: 'Sparkles',
        roles: MANAGEMENT_ROLES,
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
            id: 'ai-agents',
            title: 'AI Agents',
            url: '/ai-studio/agents',
            roles: MANAGEMENT_ROLES,
            description: 'Manage virtual voice agents',
          },
          {
            id: 'preview-studio',
            title: 'Preview Studio',
            url: '/preview-studio',
            roles: MANAGEMENT_ROLES,
            description: 'Test and preview AI agent behavior',
          },
          {
            id: 'agentic-operator',
            title: 'AgentX',
            url: '/ai-studio/operator',
            roles: MANAGEMENT_ROLES,
            description: 'Unified agentic operations panel',
          },
          {
            id: 'agent-prompts',
            title: 'Agent Prompts',
            url: '/ai-studio/agent-prompts',
            roles: ['admin'],
            description: 'Manage agent prompts by role',
          },
        ],
      },
      {
        id: 'generative-studio',
        title: 'Generative Studio',
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
        id: 'accounts',
        title: 'Accounts',
        icon: 'Building2',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
        items: [
          {
            id: 'all-accounts',
            title: 'All Accounts',
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
        ],
      },
      {
        id: 'contacts',
        title: 'Contacts',
        icon: 'Users',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
        items: [
          {
            id: 'all-contacts',
            title: 'All Contacts',
            url: '/contacts',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
          },
          {
            id: 'contact-segments',
            title: 'Contact Segments & Lists',
            url: '/segments?entity=contact',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
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
            id: 'opportunities',
            title: 'Opportunities',
            url: '/pipeline',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS],
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
            id: 'clients',
            title: 'Clients',
            url: '/client-portal-admin',
            roles: MANAGEMENT_ROLES,
            description: 'Manage client accounts and portal access',
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
    roles: [...MANAGEMENT_ROLES, USER_ROLES.AGENT],
    description: 'Campaign management, agent console, and lead review',
    items: [
      {
        id: 'campaigns-hub',
        title: 'Campaigns',
        url: '/campaigns',
        icon: 'Megaphone',
        roles: MANAGEMENT_ROLES,
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
        id: 'qa-lead-review',
        title: 'QA & Lead Review',
        url: '/leads',
        icon: 'CheckCircle',
        roles: [...QA_ROLES, USER_ROLES.AGENT],
        description: 'Review and qualify leads',
      },
      {
        id: 'conversation-quality',
        title: 'Conversation Quality',
        url: '/conversation-quality',
        icon: 'MessageSquare',
        roles: MANAGEMENT_ROLES,
        description: 'Call quality analysis and scoring',
      },
    ],
  },

  // ============================================
  // DATA & VERIFICATION DOMAIN
  // ============================================
  {
    id: 'data-verification',
    label: 'Data & Verification',
    domain: NAVIGATION_DOMAINS.DATA_VERIFICATION,
    roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST],
    description: 'Data integrity, validation, and verification campaigns',
    items: [
      {
        id: 'data-integrity',
        title: 'Data Integrity',
        url: '/data-integrity',
        icon: 'ShieldCheck',
        roles: DATA_ROLES,
        description: 'Data quality and integrity checks',
      },
      {
        id: 'validation-campaigns',
        title: 'Verification Campaigns',
        url: '/verification/campaigns',
        icon: 'Database',
        roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST],
        description: 'Lead and contact verification workflows',
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
      {
        id: 'call-recordings',
        title: 'Call Recordings',
        url: '/call-recordings',
        icon: 'Headphones',
        roles: [...QA_ROLES, USER_ROLES.CLIENT_USER],
        description: 'Browse, search, and playback all call recordings',
      },
      {
        id: 'reports',
        title: 'Reports',
        url: '/reports',
        icon: 'FileText',
        roles: [...QA_ROLES, USER_ROLES.CLIENT_USER],
        description: 'Custom reports and exports',
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
    roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
    description: 'Project management and operational workflows',
    items: [
      {
        id: 'project-requests',
        title: 'Project Requests',
        url: '/admin/project-requests',
        icon: 'FolderKanban',
        roles: MANAGEMENT_ROLES,
        description: 'Review and approve client project requests',
        badge: { text: 'New', variant: 'new' },
      },
      {
        id: 'pm-review',
        title: 'PM Review',
        url: '/leads?tab=pm-review',
        icon: 'Briefcase',
        roles: MANAGEMENT_ROLES,
        description: 'Review QA-approved leads before client delivery',
      },
      {
        id: 'client-management',
        title: 'Client Management',
        url: '/client-portal-admin',
        icon: 'Building2',
        roles: [USER_ROLES.ADMIN],
        description: 'Manage clients, client users, and portal access',
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
        ],
      },
    ],
  },

  // ============================================
  // SETTINGS DOMAIN (NEW HUB)
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
        id: 'settings-hub',
        title: 'Settings',
        icon: 'Settings',
        roles: [USER_ROLES.ADMIN],
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
          {
            id: 'settings-integrations',
            title: 'Integrations',
            url: '/settings/integrations',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'settings-agent-defaults',
            title: 'Agent Defaults',
            url: '/settings/agent-defaults',
            roles: [USER_ROLES.ADMIN],
            description: 'Configure default AI agent settings',
          },
          {
            id: 'settings-knowledge-hub',
            title: 'Knowledge Hub',
            url: '/settings/knowledge-hub',
            roles: [USER_ROLES.ADMIN],
            description: 'Unified AI knowledge source management',
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
            title: 'Cloud Logs',
            url: '/cloud-logs',
            roles: [USER_ROLES.ADMIN],
            description: 'Monitor cloud logs and system health',
          },
          {
            id: 'settings-smtp-providers',
            title: 'SMTP Providers',
            url: '/settings/smtp-providers',
            roles: [USER_ROLES.ADMIN],
            description: 'Configure SMTP providers for transactional emails',
          },
          {
            id: 'settings-transactional-templates',
            title: 'Transactional Templates',
            url: '/settings/transactional-templates',
            roles: [USER_ROLES.ADMIN],
            description: 'Manage transactional email templates',
          },
          {
            id: 'settings-mercury-notifications',
            title: 'Mercury Notifications',
            url: '/settings/mercury-notifications',
            roles: [USER_ROLES.ADMIN],
            description: 'Mercury Bridge — email templates, test sends, bulk invitations, and notification rules',
          },
          {
            id: 'settings-domain-management',
            title: 'Domain Management',
            url: '/settings/domain-management',
            roles: [USER_ROLES.ADMIN],
            description: 'Configure sending domains and DNS records',
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
