/**
 * Route Permissions Configuration
 *
 * Maps routes to their required user roles.
 * If a route is not listed here, it's accessible to all authenticated users.
 */

import { USER_ROLES } from './navigation-config';

// Role groups for common access patterns
const ALL_ROLES = Object.values(USER_ROLES);
const MANAGEMENT_ROLES = [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER];
const DATA_ROLES = [USER_ROLES.ADMIN, USER_ROLES.DATA_OPS];
const QA_ROLES = [
  USER_ROLES.ADMIN,
  USER_ROLES.CAMPAIGN_MANAGER,
  USER_ROLES.QUALITY_ANALYST,
  'manager',
  'qa_analyst',
];
const VOICE_TRAINING_ROLES = [...QA_ROLES, USER_ROLES.VOICE_TRAINER];
const AGENT_ROLES = [...MANAGEMENT_ROLES, USER_ROLES.AGENT];
const ANALYTICS_ROLES = [...QA_ROLES, USER_ROLES.CLIENT_USER];
const CLIENT_ACCESS_ROLES = [...MANAGEMENT_ROLES, USER_ROLES.CLIENT_USER];

export interface RoutePermission {
  pattern: string | RegExp;
  roles: string[];
  description?: string;
}

/**
 * Route permissions configuration
 * Routes are checked in order - first match wins
 * Use RegExp for dynamic routes like /accounts/:id
 */
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // ============================================
  // DASHBOARD - All authenticated users
  // ============================================
  { pattern: '/', roles: ALL_ROLES, description: 'Dashboard' },

  // ============================================
  // AI STUDIO - Management only
  // ============================================
  { pattern: '/ai-studio', roles: MANAGEMENT_ROLES, description: 'AI Studio Dashboard' },
  { pattern: /^\/ai-studio\//, roles: MANAGEMENT_ROLES, description: 'AI Studio pages' },
  { pattern: '/preview-studio', roles: MANAGEMENT_ROLES, description: 'Preview Studio (Admin)' },
  { pattern: '/voice-agent-training', roles: VOICE_TRAINING_ROLES, description: 'Voice Agent Training Dashboard' },
  { pattern: '/voice-simulation', roles: CLIENT_ACCESS_ROLES, description: 'Voice Simulation' },
  { pattern: '/email-simulation', roles: CLIENT_ACCESS_ROLES, description: 'Email Simulation' },
  { pattern: '/ops-hub', roles: [...MANAGEMENT_ROLES, 'manager'], description: 'Operations Hub' },
  { pattern: '/virtual-agents', roles: MANAGEMENT_ROLES, description: 'Virtual Agents' },
  { pattern: /^\/virtual-agents\//, roles: MANAGEMENT_ROLES, description: 'Virtual Agent pages' },
  { pattern: '/create-ai-agent', roles: MANAGEMENT_ROLES, description: 'Create AI Agent' },
  { pattern: '/ai-project-creator', roles: MANAGEMENT_ROLES, description: 'AI Project Creator' },

  // ============================================
  // CLIENT CAMPAIGN TOOLS - Test/Queue
  // ============================================
  { pattern: /^\/campaigns\/[^/]+\/test$/, roles: CLIENT_ACCESS_ROLES, description: 'Campaign Test Calls' },
  { pattern: /^\/campaigns\/phone\/[^/]+\/queue$/, roles: CLIENT_ACCESS_ROLES, description: 'Campaign Queue (Phone)' },
  { pattern: /^\/campaigns\/[^/]+\/queue$/, roles: CLIENT_ACCESS_ROLES, description: 'Campaign Queue' },
  { pattern: '/campaign-test', roles: CLIENT_ACCESS_ROLES, description: 'Campaign Test (Legacy)' },

  // ============================================
  // ACCOUNTS & CONTACTS - Management + Data Ops
  // ============================================
  { pattern: '/accounts', roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Accounts' },
  { pattern: /^\/accounts\//, roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Account detail' },
  { pattern: /^\/accounts-list\//, roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Account list detail' },
  { pattern: '/contacts', roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Contacts' },
  { pattern: /^\/contacts\//, roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Contact detail' },
  { pattern: '/segments', roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Segments' },
  { pattern: /^\/segments\//, roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'Segment detail' },
  { pattern: /^\/lists\//, roles: [...MANAGEMENT_ROLES, USER_ROLES.DATA_OPS], description: 'List detail' },
  { pattern: '/domain-sets', roles: [USER_ROLES.ADMIN, USER_ROLES.DATA_OPS], description: 'Domain Sets (TAL)' },
  { pattern: /^\/domain-sets\//, roles: [USER_ROLES.ADMIN, USER_ROLES.DATA_OPS], description: 'Domain Set detail' },

  // ============================================
  // PIPELINE & CRM - Management roles only
  // ============================================
  { pattern: '/pipeline', roles: MANAGEMENT_ROLES, description: 'Pipeline' },
  { pattern: /^\/pipeline\//, roles: MANAGEMENT_ROLES, description: 'Pipeline pages' },
  { pattern: /^\/opportunities\//, roles: MANAGEMENT_ROLES, description: 'Opportunity detail' },
  { pattern: '/inbox', roles: MANAGEMENT_ROLES, description: 'Revenue Inbox' },

  // ============================================
  // CAMPAIGNS - Management roles
  // ============================================
  { pattern: '/campaigns', roles: CLIENT_ACCESS_ROLES, description: 'Campaigns' },
  { pattern: '/campaign-manager', roles: MANAGEMENT_ROLES, description: 'Campaign Manager' },
  { pattern: /^\/campaigns\//, roles: MANAGEMENT_ROLES, description: 'Campaign pages' },
  { pattern: '/email-campaigns', roles: MANAGEMENT_ROLES, description: 'Email Campaigns' },
  { pattern: /^\/email-campaigns\//, roles: MANAGEMENT_ROLES, description: 'Email Campaign pages' },
  { pattern: /^\/simple-email-campaigns\//, roles: MANAGEMENT_ROLES, description: 'Simple Email Campaign pages' },
  { pattern: '/email-templates', roles: MANAGEMENT_ROLES, description: 'Email Templates' },
  { pattern: '/email-sequences', roles: MANAGEMENT_ROLES, description: 'Email Sequences' },
  { pattern: /^\/phone-campaigns\//, roles: MANAGEMENT_ROLES, description: 'Phone Campaign pages' },
  { pattern: '/telemarketing', roles: MANAGEMENT_ROLES, description: 'Telemarketing' },
  { pattern: /^\/telemarketing\//, roles: MANAGEMENT_ROLES, description: 'Telemarketing pages' },
  { pattern: '/phone-bulk-editor', roles: MANAGEMENT_ROLES, description: 'Phone Bulk Editor' },

  // ============================================
  // AGENT CONSOLE - Management + Agent
  // ============================================
  { pattern: '/agent-console', roles: AGENT_ROLES, description: 'Agent Console' },
  { pattern: '/unified-agent-console', roles: AGENT_ROLES, description: 'Unified Agent Console' },
  { pattern: '/agent-command-center', roles: AGENT_ROLES, description: 'Agent Command Center' },

  // ============================================
  // LEADS & QA - QA Roles + Agent
  // ============================================
  { pattern: '/leads', roles: [...QA_ROLES, USER_ROLES.AGENT], description: 'Leads' },
  { pattern: /^\/leads\//, roles: [...QA_ROLES, USER_ROLES.AGENT], description: 'Lead detail' },
  { pattern: '/lead-forms', roles: MANAGEMENT_ROLES, description: 'Lead Forms' },
  { pattern: '/disposition-intelligence', roles: [...QA_ROLES, USER_ROLES.AGENT], description: 'Disposition Intelligence Hub' },
  { pattern: /^\/disposition-intelligence\//, roles: [...QA_ROLES, USER_ROLES.AGENT], description: 'Disposition Intelligence Hub pages' },
  { pattern: '/conversation-quality', roles: QA_ROLES, description: 'Conversation Quality' },
  { pattern: '/disposition-reanalysis', roles: QA_ROLES, description: 'Disposition Reanalysis' },

  // ============================================
  // DATA & VERIFICATION - Data Ops + QA
  // ============================================
  { pattern: '/data-integrity', roles: DATA_ROLES, description: 'Data Integrity' },
  { pattern: '/verification-campaigns', roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST], description: 'Verification Campaigns' },
  { pattern: /^\/verification-campaigns\//, roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST], description: 'Verification Campaign pages' },
  { pattern: '/verification-console', roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST], description: 'Verification Console' },
  { pattern: '/verification-upload', roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST], description: 'Verification Upload' },
  { pattern: '/verification-suppression-upload', roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST], description: 'Verification Suppression Upload' },
  { pattern: /^\/verification\//, roles: [...DATA_ROLES, USER_ROLES.QUALITY_ANALYST], description: 'Verification pages' },

  // ============================================
  // ANALYTICS & REPORTS - QA Roles + Client
  // ============================================
  { pattern: '/engagement-analytics', roles: ANALYTICS_ROLES, description: 'Engagement Analytics' },
  { pattern: '/call-reports', roles: ANALYTICS_ROLES, description: 'Call Reports' },
  { pattern: /^\/call-reports\//, roles: ANALYTICS_ROLES, description: 'Call Report detail' },
  { pattern: '/reports', roles: ANALYTICS_ROLES, description: 'Reports' },
  { pattern: '/agent-reports', roles: ANALYTICS_ROLES, description: 'Agent Reports' },
  { pattern: '/agent-reports-dashboard', roles: ANALYTICS_ROLES, description: 'Agent Reports Dashboard' },
  { pattern: '/ai-call-analytics', roles: ANALYTICS_ROLES, description: 'AI Call Analytics' },
  { pattern: '/showcase-calls', roles: [...ANALYTICS_ROLES, USER_ROLES.AGENT], description: 'Showcase Calls' },

  // ============================================
  // OPERATIONS - Management + Client
  // ============================================
  { pattern: '/imports', roles: MANAGEMENT_ROLES, description: 'Imports' },

  // ============================================
  // CLIENT PORTAL ADMIN - Admin only
  // ============================================
  { pattern: '/client-portal-admin', roles: [USER_ROLES.ADMIN], description: 'Client Portal Admin' },
  { pattern: '/client-hierarchy-manager', roles: [USER_ROLES.ADMIN], description: 'Client Hierarchy Manager' },
  {
    pattern: '/admin/todo-board',
    roles: [USER_ROLES.ADMIN, USER_ROLES.CAMPAIGN_MANAGER, USER_ROLES.DATA_OPS, USER_ROLES.QUALITY_ANALYST, USER_ROLES.AGENT],
    description: 'AI-Powered Strategic Task Management Board',
  },

  // ============================================
  // IAM - Admin only
  // ============================================
  { pattern: '/iam', roles: [USER_ROLES.ADMIN], description: 'IAM Overview' },
  { pattern: /^\/iam\//, roles: [USER_ROLES.ADMIN], description: 'IAM pages' },

  // ============================================
  // SETTINGS - Admin only (except profile)
  // ============================================
  { pattern: '/settings/profile', roles: ALL_ROLES, description: 'Profile Settings' },
  { pattern: /^\/settings\/email-management(?:\?.*)?$/, roles: MANAGEMENT_ROLES, description: 'Campaign Email Management' },
  { pattern: '/settings', roles: [USER_ROLES.ADMIN], description: 'Settings' },
  { pattern: /^\/settings\//, roles: [USER_ROLES.ADMIN], description: 'Settings pages' },
  { pattern: '/email-builder', roles: [USER_ROLES.ADMIN], description: 'Email Builder' },
  { pattern: /^\/email-builder\//, roles: [USER_ROLES.ADMIN], description: 'Email Builder pages' },
  { pattern: '/cloud-logs', roles: [USER_ROLES.ADMIN], description: 'Cloud Logs' },

  // ============================================
  // LEGACY/OTHER ROUTES - Admin or Management
  // ============================================
  { pattern: '/user-management', roles: [USER_ROLES.ADMIN], description: 'User Management (legacy)' },
  { pattern: '/sender-profiles', roles: MANAGEMENT_ROLES, description: 'Sender Profiles' },
  { pattern: /^\/email-infrastructure\//, roles: MANAGEMENT_ROLES, description: 'Email Infrastructure' },
  { pattern: /^\/telephony\//, roles: [USER_ROLES.ADMIN], description: 'Telephony' },
  { pattern: '/sip-trunk-settings', roles: [USER_ROLES.ADMIN], description: 'SIP Trunk Settings' },

  // ============================================
  // CONTENT & RESOURCES - Management
  // ============================================
  { pattern: '/content-studio', roles: MANAGEMENT_ROLES, description: 'Content Studio' },
  { pattern: /^\/content-studio\//, roles: MANAGEMENT_ROLES, description: 'Content Studio pages' },
  { pattern: '/ai-content-generator', roles: MANAGEMENT_ROLES, description: 'AI Content Generator' },
  { pattern: '/social-media-publisher', roles: MANAGEMENT_ROLES, description: 'Social Media Publisher' },
  { pattern: '/suppressions', roles: MANAGEMENT_ROLES, description: 'Suppressions' },
  { pattern: '/content-promotion', roles: MANAGEMENT_ROLES, description: 'Content Promotion' },

  // ============================================
  // RESOURCES & EVENTS - All authenticated users
  // ============================================
  { pattern: '/events', roles: ALL_ROLES, description: 'Events' },
  { pattern: '/resources', roles: ALL_ROLES, description: 'Resources' },
  { pattern: '/resources-centre', roles: ALL_ROLES, description: 'Resources Centre' },
  { pattern: '/news', roles: ALL_ROLES, description: 'News' },

  // ============================================
  // EMAIL VALIDATION TEST - Data ops
  // ============================================
  { pattern: '/email-validation-test', roles: DATA_ROLES, description: 'Email Validation Test' },
];

/**
 * Get required roles for a given path
 * Returns null if route is not in the configuration (default: allow all authenticated)
 */
export function getRoutePermissions(path: string): string[] | null {
  for (const permission of ROUTE_PERMISSIONS) {
    if (typeof permission.pattern === 'string') {
      if (permission.pattern === path) {
        return permission.roles;
      }
    } else if (permission.pattern instanceof RegExp) {
      if (permission.pattern.test(path)) {
        return permission.roles;
      }
    }
  }
  return null; // Route not in config - allow all authenticated users
}

/**
 * Check if a user with the given roles can access a path
 */
export function canAccessRoute(userRoles: string[], path: string): boolean {
  // Admin always has access
  if (userRoles.includes(USER_ROLES.ADMIN)) {
    return true;
  }

  // Voice trainer role is strictly restricted — only allow voice training dashboard and profile
  if (userRoles.includes(USER_ROLES.VOICE_TRAINER)) {
    const allowedPaths = ['/voice-agent-training', '/settings/profile'];
    return allowedPaths.includes(path);
  }

  const requiredRoles = getRoutePermissions(path);

  // If route not in config, allow all authenticated users
  if (requiredRoles === null) {
    return true;
  }

  // Check if user has any of the required roles
  return requiredRoles.some(role => userRoles.includes(role.toLowerCase()));
}
