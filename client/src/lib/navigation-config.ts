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
 * Simplified, flat structure: Overview + 5 groups + Settings (admin)
 */
export const NAVIGATION_SECTIONS: NavSection[] = [
  // ============================================
  // OVERVIEW (pinned)
  // ============================================
  {
    id: 'overview',
    label: '',
    domain: NAVIGATION_DOMAINS.CORE_CRM,
    roles: ALL_ROLES,
    items: [
      {
        id: 'overview',
        title: 'Overview',
        url: '/',
        icon: 'LayoutDashboard',
        roles: ALL_ROLES,
      },
    ],
  },

  // ============================================
  // CAMPAIGNS
  // ============================================
  {
    id: 'campaigns',
    label: 'Campaigns',
    domain: NAVIGATION_DOMAINS.CAMPAIGNS,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.AGENT, USER_ROLES.CLIENT_USER],
    items: [
      {
        id: 'campaigns-group',
        title: 'Campaigns',
        icon: 'Megaphone',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
        items: [
          {
            id: 'all-campaigns',
            title: 'All Campaigns',
            url: '/campaigns',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
          },
          {
            id: 'create-campaign',
            title: 'Create Campaign',
            url: '/campaigns/create',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'pipeline-engagement',
            title: 'Pipeline & Engagement',
            url: '/pipeline',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'work-orders',
            title: 'Work Orders',
            url: '/admin/project-requests',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'bookings',
            title: 'Bookings',
            url: '/admin/bookings',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'upcoming-events',
            title: 'Upcoming Events',
            url: '/events',
            roles: MANAGEMENT_ROLES,
          },
        ],
      },
    ],
  },

  // ============================================
  // ARGYLE AI STUDIO
  // ============================================
  {
    id: 'ai-intelligence',
    label: 'Argyle AI Studio',
    domain: NAVIGATION_DOMAINS.AI_INTELLIGENCE,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
    items: [
      {
        id: 'ai-studio-group',
        title: 'AI Studio',
        icon: 'Sparkles',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
        items: [
          {
            id: 'org-intelligence',
            title: 'Org Intelligence',
            url: '/ai-studio/intelligence',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'target-markets',
            title: 'Target Markets',
            url: '/domain-sets',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'creative-studio',
            title: 'Creative Studio',
            url: '/generative-studio',
            roles: MANAGEMENT_ROLES,
          },
          {
            id: 'preview-studio',
            title: 'Preview Studio',
            url: '/preview-studio',
            roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
          },
        ],
      },
    ],
  },

  // ============================================
  // COMMUNICATIONS
  // ============================================
  {
    id: 'communications',
    label: 'Communications',
    domain: NAVIGATION_DOMAINS.CORE_CRM,
    roles: MANAGEMENT_ROLES,
    items: [
      {
        id: 'shared-inbox',
        title: 'Shared Inbox',
        url: '/inbox',
        icon: 'Inbox',
        roles: MANAGEMENT_ROLES,
        badge: { text: 'New', variant: 'new' as BadgeVariant },
        description: 'Unified shared inbox for all communications',
      },
    ],
  },

  // ============================================
  // ANALYTICS
  // ============================================
  {
    id: 'analytics',
    label: 'Analytics',
    domain: NAVIGATION_DOMAINS.ANALYTICS,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.QUALITY_ANALYST, USER_ROLES.CLIENT_USER],
    items: [
      {
        id: 'reports-analytics',
        title: 'Reports & Analytics',
        url: '/engagement-analytics',
        icon: 'BarChart3',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.QUALITY_ANALYST, USER_ROLES.CLIENT_USER],
      },
    ],
  },

  // ============================================
  // ACCOUNT
  // ============================================
  {
    id: 'account',
    label: 'Account',
    domain: NAVIGATION_DOMAINS.OPERATIONS,
    roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
    items: [
      {
        id: 'account-group',
        title: 'Account',
        icon: 'Briefcase',
        roles: [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER],
        items: [
          {
            id: 'billing-invoices',
            title: 'Billing & Invoices',
            url: '/finance-program',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'client-guide',
            title: 'Client Guide',
            url: '/client-portal-admin',
            roles: MANAGEMENT_ROLES,
          },
        ],
      },
    ],
  },

  // ============================================
  // SETTINGS (admin only, collapsed by default)
  // ============================================
  {
    id: 'settings',
    label: 'Settings',
    domain: NAVIGATION_DOMAINS.SETTINGS,
    roles: [USER_ROLES.ADMIN],
    collapsedByDefault: true,
    items: [
      {
        id: 'settings-general',
        title: 'General',
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
            id: 'settings-integrations',
            title: 'Integrations',
            url: '/settings/integrations',
            roles: [USER_ROLES.ADMIN],
          },
        ],
      },
      {
        id: 'settings-telephony-group',
        title: 'Telephony',
        icon: 'Phone',
        roles: [USER_ROLES.ADMIN],
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
          },
        ],
      },
      {
        id: 'settings-ai-group',
        title: 'AI Configuration',
        icon: 'Bot',
        roles: [USER_ROLES.ADMIN],
        items: [
          {
            id: 'settings-agent-defaults',
            title: 'Agent Defaults',
            url: '/settings/agent-defaults',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'settings-ai-governance',
            title: 'AI Governance',
            url: '/settings/ai-governance',
            roles: [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER],
          },
        ],
      },
      {
        id: 'settings-email-group',
        title: 'Email & Messaging',
        icon: 'Mail',
        roles: [USER_ROLES.ADMIN],
        items: [
          {
            id: 'settings-mercury-notifications',
            title: 'Mercury & Transactional',
            url: '/settings/mercury-notifications',
            roles: [USER_ROLES.ADMIN],
          },
          {
            id: 'settings-email-management',
            title: 'Campaign Email',
            url: '/settings/email-management',
            roles: [USER_ROLES.ADMIN],
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
