/**
 * Route Constants
 *
 * Centralized route definitions with deprecation tracking.
 * All application routes should reference these constants.
 */

// ============================================
// CORE ROUTES
// ============================================
export const ROUTES = {
  // Dashboard
  HOME: '/',
  DASHBOARD: '/',

  // ==========================================
  // CRM Routes
  // ==========================================
  ACCOUNTS: '/accounts',
  ACCOUNT_DETAIL: '/accounts/:id',
  CONTACTS: '/contacts',
  CONTACT_DETAIL: '/contacts/:id',
  SEGMENTS: '/segments',
  LISTS: '/lists',
  DOMAIN_SETS: '/domain-sets',

  // ==========================================
  // Campaign Routes (Unified)
  // ==========================================
  CAMPAIGNS: '/campaigns',
  CAMPAIGN_CREATE: '/campaigns/create',
  CAMPAIGN_EDIT: '/campaigns/:id/edit',
  CAMPAIGN_CONFIG: '/campaigns/:id/config',
  CAMPAIGN_QUEUE: '/campaigns/:id/queue',
  CAMPAIGN_TEST: '/campaigns/:id/test',
  CAMPAIGN_ANALYTICS: '/campaigns/:id/analytics',

  // ==========================================
  // AI Studio Routes
  // ==========================================
  AI_STUDIO: '/ai-studio',
  AI_STUDIO_DASHBOARD: '/ai-studio',
  AI_STUDIO_INTELLIGENCE: '/ai-studio/intelligence',
  AI_STUDIO_AGENTS: '/ai-studio/agents',
  AI_STUDIO_AGENT_CREATE: '/ai-studio/agents/create',
  AI_STUDIO_AGENT_EDIT: '/ai-studio/agents/:id/edit',
  AI_STUDIO_CAMPAIGN_MANAGER: '/ai-studio/campaign-manager',
  AI_STUDIO_CAMPAIGN_INTELLIGENCE: '/ai-studio/campaign-intelligence',
  AI_STUDIO_OPERATOR: '/ai-studio/operator',
  PREVIEW_STUDIO: '/preview-studio',
  VIRTUAL_AGENTS: '/virtual-agents',

  // ==========================================
  // Settings Hub Routes
  // ==========================================
  SETTINGS: '/settings',
  SETTINGS_PROFILE: '/settings/profile',
  SETTINGS_USERS: '/settings/users',
  SETTINGS_TELEPHONY: '/settings/telephony',
  SETTINGS_CUSTOM_FIELDS: '/settings/custom-fields',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_SECURITY: '/settings/security',
  SETTINGS_INTEGRATIONS: '/settings/integrations',
  SETTINGS_BACKGROUND_JOBS: '/settings/background-jobs',
  SETTINGS_COMPLIANCE: '/settings/compliance',
  SETTINGS_DATA: '/settings/data',
  SETTINGS_AGENT_DEFAULTS: '/settings/agent-defaults',
  SETTINGS_AI_GOVERNANCE: '/settings/ai-governance',
  SETTINGS_KNOWLEDGE_HUB: '/settings/knowledge-hub',
  SETTINGS_PROMPT_INSPECTOR: '/settings/prompt-inspector',
  SETTINGS_VOICE_ENGINE: '/settings/voice-engine',

  // Super Organization Settings (Owner-only)
  SETTINGS_SUPER_ORG: '/settings/super-org',
  SETTINGS_SUPER_ORG_MEMBERS: '/settings/super-org/members',
  SETTINGS_SUPER_ORG_CREDENTIALS: '/settings/super-org/credentials',
  SETTINGS_SUPER_ORG_CLIENTS: '/settings/super-org/clients',

  // ==========================================
  // Analytics Routes
  // ==========================================
  ENGAGEMENT_ANALYTICS: '/engagement-analytics',
  AI_CALL_ANALYTICS: '/call-reports?tab=ai',
  REPORTS: '/reports',
  CALL_REPORTS: '/call-reports',

  // ==========================================
  // Pipeline Routes
  // ==========================================
  PIPELINE: '/pipeline',
  PIPELINE_IMPORT: '/pipeline/import',
  OPPORTUNITY_DETAIL: '/opportunities/:id',
  INBOX: '/inbox',

  // ==========================================
  // Email Routes
  // ==========================================
  EMAIL_SEQUENCES: '/email-sequences',
  EMAIL_SEQUENCE_DETAIL: '/email-sequences/:id',

  // ==========================================
  // Verification Routes
  // ==========================================
  VERIFICATION_CAMPAIGNS: '/verification/campaigns',
  VERIFICATION_CONSOLE: '/verification/console',
  VERIFICATION_CAMPAIGN_CONFIG: '/verification/campaigns/:id/config',

  // ==========================================
  // Agent & Execution Routes
  // ==========================================
  AGENT_CONSOLE: '/agent-console',
  LEADS: '/leads',
  CONVERSATION_QUALITY: '/conversation-quality',
  DISPOSITION_INTELLIGENCE: '/disposition-intelligence',
  POTENTIAL_LEADS: '/disposition-intelligence/potential-leads',

  // ==========================================
  // Data Routes
  // ==========================================
  DATA_INTEGRITY: '/data-integrity',
  CLOUD_LOGS: '/cloud-logs',

  // ==========================================
  // Auth Routes
  // ==========================================
  LOGIN: '/login',
  LOGOUT: '/logout',

  // ==========================================
  // Client Portal Routes
  // ==========================================
  CLIENT_PORTAL: '/client-portal',
  CLIENT_PORTAL_ADMIN: '/client-portal-admin',
  ADMIN_TODO_BOARD: '/admin/todo-board',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = typeof ROUTES[RouteKey];

// ============================================
// DEPRECATED ROUTES
// These routes will redirect to new locations
// ============================================
export const DEPRECATED_ROUTES = {
  // Campaign routes (consolidated into /campaigns)
  PHONE_CAMPAIGNS: {
    path: '/phone-campaigns',
    redirectTo: '/campaigns?type=phone',
    message: 'Use /campaigns?type=phone instead of /phone-campaigns',
  },
  EMAIL_CAMPAIGNS: {
    path: '/email-campaigns',
    redirectTo: '/campaigns?type=email',
    message: 'Use /campaigns?type=email instead of /email-campaigns',
  },
  CAMPAIGNS_PHONE: {
    path: '/campaigns/phone',
    redirectTo: '/campaigns?type=phone',
    message: 'Use /campaigns?type=phone instead of /campaigns/phone',
  },
  CAMPAIGNS_EMAIL: {
    path: '/campaigns/email',
    redirectTo: '/campaigns?type=email',
    message: 'Use /campaigns?type=email instead of /campaigns/email',
  },
  CAMPAIGNS_TELEMARKETING: {
    path: '/campaigns/telemarketing',
    redirectTo: '/campaigns?type=phone',
    message: 'Use /campaigns?type=phone instead of /campaigns/telemarketing',
  },

  // Settings routes (consolidated into /settings/*)
  SIP_TRUNK_SETTINGS: {
    path: '/sip-trunk-settings',
    redirectTo: '/settings/telephony',
    message: 'Use /settings/telephony instead of /sip-trunk-settings',
  },
  USER_MANAGEMENT: {
    path: '/user-management',
    redirectTo: '/settings/users',
    message: 'Use /settings/users instead of /user-management',
  },
  OLD_SETTINGS: {
    path: '/settings-old',
    redirectTo: '/settings',
    message: 'Use /settings instead of /settings-old',
  },
} as const;

export type DeprecatedRouteKey = keyof typeof DEPRECATED_ROUTES;

/**
 * Log deprecation warning for a route
 */
export function logRouteDeprecation(routeKey: DeprecatedRouteKey): void {
  const route = DEPRECATED_ROUTES[routeKey];
  console.warn(
    `[DEPRECATED ROUTE] ${route.message}\n` +
    `Redirecting from "${route.path}" to "${route.redirectTo}"`
  );
}

/**
 * Check if a path is deprecated and get redirect info
 */
export function getDeprecatedRouteInfo(path: string): typeof DEPRECATED_ROUTES[DeprecatedRouteKey] | undefined {
  for (const key of Object.keys(DEPRECATED_ROUTES) as DeprecatedRouteKey[]) {
    if (DEPRECATED_ROUTES[key].path === path) {
      return DEPRECATED_ROUTES[key];
    }
  }
  return undefined;
}

/**
 * Get all deprecated paths as an array
 */
export function getDeprecatedPaths(): string[] {
  return Object.values(DEPRECATED_ROUTES).map(route => route.path);
}

// ============================================
// ROUTE HELPERS
// ============================================

/**
 * Generate a route with parameters
 */
export function generateRoute(route: RoutePath, params?: Record<string, string | number>): string {
  if (!params) return route;

  let result = route as string;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, String(value));
  }
  return result;
}

/**
 * Generate campaign edit route
 */
export function getCampaignEditRoute(campaignId: string | number): string {
  return generateRoute(ROUTES.CAMPAIGN_EDIT, { id: campaignId });
}

/**
 * Generate campaign config route
 */
export function getCampaignConfigRoute(campaignId: string | number): string {
  return generateRoute(ROUTES.CAMPAIGN_CONFIG, { id: campaignId });
}

/**
 * Generate campaign queue route
 */
export function getCampaignQueueRoute(campaignId: string | number): string {
  return generateRoute(ROUTES.CAMPAIGN_QUEUE, { id: campaignId });
}

/**
 * Generate account detail route
 */
export function getAccountDetailRoute(accountId: string | number): string {
  return generateRoute(ROUTES.ACCOUNT_DETAIL, { id: accountId });
}

/**
 * Generate contact detail route
 */
export function getContactDetailRoute(contactId: string | number): string {
  return generateRoute(ROUTES.CONTACT_DETAIL, { id: contactId });
}

/**
 * Generate AI agent edit route
 */
export function getAgentEditRoute(agentId: string | number): string {
  return generateRoute(ROUTES.AI_STUDIO_AGENT_EDIT, { id: agentId });
}

// ============================================
// QUERY PARAMETER HELPERS
// ============================================

/**
 * Campaign type query parameter values
 */
export const CAMPAIGN_TYPE_PARAMS = {
  ALL: '',
  PHONE: 'phone',
  EMAIL: 'email',
  COMBO: 'combo',
} as const;

/**
 * Segment entity query parameter values
 */
export const SEGMENT_ENTITY_PARAMS = {
  ACCOUNT: 'account',
  CONTACT: 'contact',
} as const;

/**
 * Generate campaigns route with type filter
 */
export function getCampaignsRoute(type?: keyof typeof CAMPAIGN_TYPE_PARAMS): string {
  if (!type || type === 'ALL') return ROUTES.CAMPAIGNS;
  return `${ROUTES.CAMPAIGNS}?type=${CAMPAIGN_TYPE_PARAMS[type]}`;
}

/**
 * Generate segments route with entity filter
 */
export function getSegmentsRoute(entity: keyof typeof SEGMENT_ENTITY_PARAMS): string {
  return `${ROUTES.SEGMENTS}?entity=${SEGMENT_ENTITY_PARAMS[entity]}`;
}
