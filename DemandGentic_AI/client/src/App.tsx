import { Switch, Route, Redirect, useLocation } from "wouter";
import { lazy, Suspense, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ProtectedRoute } from "@/components/protected-route";
import { ClientPortalProtectedRoute } from "@/components/client-portal/client-portal-protected-route";
import { CommandPalette } from "@/components/patterns/command-palette";
import { DeprecatedRedirect } from "@/components/deprecated-redirect";
import { ROUTES, DEPRECATED_ROUTES } from "@/lib/routes";
import { canAccessRoute } from "@/lib/route-permissions";
import { AgentPanelProvider, AgentSidePanel } from "@/components/agent-panel";
import { Shield, ArrowLeft, LogOut, Bot, Sparkles, User, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import LandingPage from "@/pages/landing";
import UkefLandingPage from "@/pages/ukef-landing";
import AboutPage from "@/pages/about";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import TermsOfServicePage from "@/pages/terms-of-service";
import GDPRPolicyPage from "@/pages/gdpr-policy";
import ContactUsPage from "@/pages/contact-us";
import ProposalRequestPage from "@/pages/proposal-request";
import Dashboard from "@/pages/dashboard";
import AccountsPage from "@/pages/accounts";
import AccountDetailPage from "@/pages/account-detail";
import ContactsPage from "@/pages/contacts";
import ContactDetailPage from "@/pages/contact-detail";
import SegmentsPage from "@/pages/segments";
import SegmentDetailPage from "@/pages/segment-detail";
import ListDetailPage from "@/pages/list-detail";
import DomainSetsPage from "@/pages/domain-sets";
import AccountsListDetail from "@/pages/accounts-list-detail";
import CampaignsHub from "@/pages/campaign-hub";
import CampaignCreatePage from "@/pages/campaign-create";
import EmailCampaignCreatePage from "@/pages/email-campaign-create";
import SimpleEmailCampaignCreatePage from "@/pages/simple-email-campaign-create";
import SimpleEmailCampaignEditPage from "@/pages/simple-email-campaign-edit";
import EmailCampaignReportsPage from "@/pages/email-campaign-reports";
import EmailTemplatesPage from "@/pages/email-templates";
import TelemarketingCreatePage from "@/pages/telemarketing-create";
import PhoneCampaignEditPage from "@/pages/phone-campaign-edit";
import CampaignQueuePage from "@/pages/campaign-queue";
import CampaignConfigPage from "@/pages/campaign-config";
import CampaignSuppressionsPage from "@/pages/campaign-suppressions";
import LeadsPage from "@/pages/leads";
import LeadDetailPage from "@/pages/lead-detail";
import SuppressionsPage from "@/pages/suppressions";
import TelemarketingSuppressionListPage from "@/pages/telemarketing-suppression-list";
import ImportsPage from "@/pages/imports";
// CallIntelligenceDashboard removed - page deprecated

// Lazy-loaded components
const CloudLogsMonitor = lazy(() => import("./pages/cloud-logs-monitor"));
const CampaignManagerPage = lazy(() => import("@/pages/campaign-manager"));
const ContentStudioPage = lazy(() => import("@/pages/content-studio"));
const GenerativeStudioPage = lazy(() => import("@/pages/generative-studio"));
const ContentGovernancePage = lazy(() => import("@/pages/content-governance"));
const AIContentGeneratorPage = lazy(() => import("@/pages/ai-content-generator"));
const SocialMediaPublisherPage = lazy(() => import("@/pages/social-media-publisher"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const DispositionIntelligenceHubPage = lazy(() => import("@/pages/unified-intelligence"));
const PotentialLeadsPage = lazy(() => import("@/pages/potential-leads"));
const EngagementAnalyticsPage = lazy(() => import("@/pages/engagement-analytics"));
import UnifiedAgentConsolePage from "@/pages/unified-agent-console";
import SettingsPage from "@/pages/settings";
import UserManagementPage from "@/pages/user-management";
import EventsPage from "@/pages/events";
import ResourcesPage from "@/pages/resources";
import NewsPage from "@/pages/news";
import SipTrunkSettingsPage from "@/pages/sip-trunk-settings";
import AgentConsolePage from "./pages/agent-console";
import ResourcesCentrePage from "@/pages/resources-centre";
import ResourcesCentrePublicPage from "@/pages/resources-centre-public";
import VerificationCampaignsPage from "@/pages/verification-campaigns";
import VerificationCampaignConfigPage from "@/pages/verification-campaign-config";
import VerificationCampaignStatsPage from "@/pages/verification-campaign-stats";
import VerificationConsolePage from "@/pages/verification-console";
import VerificationUploadPage from "@/pages/verification-upload";
import VerificationSuppressionUploadPage from "@/pages/verification-suppression-upload";
import PhoneBulkEditorPage from "@/pages/phone-bulk-editor";
import NumberPoolPage from "@/pages/number-pool";
import EmailValidationTest from "./pages/email-validation-test";
import PivotalPipelineManagementPage from "@/pages/pivotal-pipeline-management";
import PipelineManagementPage from "@/pages/pipeline-management";
import PipelineImportPage from "@/pages/pipeline-import";
import OpportunityDetailPage from "@/pages/opportunity-detail";
import EmailSequencesPage from "@/pages/email-sequences";
import InboxPage from "@/pages/inbox";
const AgentReportsDashboard = lazy(() => import("@/pages/agent-reports-dashboard"));
const FinanceProgramPage = lazy(() => import("@/pages/finance-program"));
import LeadFormsPage from "@/pages/lead-forms";
import LeadFormPublicPage from "@/pages/lead-form-public";
import AIProjectCreatorPage from "@/pages/ai-project-creator";
import ClientPortalAdmin from "@/pages/client-portal-admin";
import OrganizationManagerPage from "@/pages/organization-manager";
import AdminProjectRequests from "@/pages/admin-project-requests";
import AdminTodoBoardPage from "@/pages/admin-todo-board";
import DataManagementPage from "@/pages/data-management";
import PublicBookingPage from "@/pages/public-booking";
import AdminBookingsPage from "@/pages/admin-bookings";
import ClientPortalLogin from "@/pages/client-portal-login";
import ClientPortalJoin from "@/pages/client-portal-join";
import ClientPortalAcceptInvite from "@/pages/client-portal-accept-invite";
import ClientPortalDashboard from "@/pages/client-portal-dashboard";
import ClientPortalSimulations from "@/pages/client-portal-simulations";
import ClientPortalVoiceSimulation from "@/pages/client-portal-voice-simulation";
import ClientPortalEmailSimulation from "@/pages/client-portal-email-simulation";
import ClientPortalOrderDetail from "@/pages/client-portal-order-detail";
import ClientServices from "@/pages/client-portal/client-services";
import ClientPortalPreviewStudio from "@/pages/client-portal-preview-studio";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import AgentCatalogPage from "@/pages/client-portal/agent-catalog";
import ClientPortalCampaignCreate from "@/pages/client-portal/campaign-create";
const ClientPortalIntelligence = lazy(() => import("@/pages/client-portal-intelligence"));
const ClientPortalGenerativeStudio = lazy(() => import("@/pages/client-portal-generative-studio"));
import ClientPortalCampaignQueue from "@/pages/client-portal-campaign-queue";
import ClientPortalCampaignPlannerPage from "@/pages/client-portal-campaign-planner";
const ClientPortalCallReports = lazy(() => import("@/pages/client-portal-call-reports"));
const ClientPortalAnalytics = lazy(() => import("@/pages/client-portal-analytics"));
const ClientPortalConversationQuality = lazy(() => import("@/pages/client-portal-conversation-quality"));
const ClientPortalShowcaseCalls = lazy(() => import("@/pages/client-portal-showcase-calls"));
const ClientPortalDisposition = lazy(() => import("@/pages/client-portal-disposition"));
const ClientPortalCostTracking = lazy(() => import("@/pages/client-portal-cost-tracking"));
const ClientPortalLeadsExport = lazy(() => import("@/pages/client-portal-leads-export"));
const ClientPortalRecordings = lazy(() => import("@/pages/client-portal-recordings"));
const ClientPortalReportsExport = lazy(() => import("@/pages/client-portal-reports-export"));
const ClientPortalUnifiedReports = lazy(() => import("@/pages/client-portal-unified-reports"));
const ClientPortalEmailInbox = lazy(() => import("@/pages/client-portal-email-inbox"));
import ClientPortalEmailCampaigns from "@/pages/client-portal-email-campaigns";
import ArgyleEventsPage from "@/pages/client-portal/argyle-events";
import ClientHierarchyManager from "@/pages/client-hierarchy-manager";
const OrganizationIntelligencePage = lazy(() => import("@/pages/ai-studio/intelligence"));
const AIAgentsPage = lazy(() => import("@/pages/ai-studio/agents"));
// AgentPromptsPage moved into Unified Agent Architecture — old route redirects
const IntelligenceStudioDashboard = lazy(() => import("@/pages/ai-studio/dashboard"));
const CampaignIntelligencePage = lazy(() => import("@/pages/ai-studio/campaign-intelligence"));
import AgentCommandCenter from "@/pages/agent-command-center";
import UnifiedAgentArchitectureDashboard from "@/pages/unified-agent-architecture";
import CreateAIAgentPage from "@/pages/create-ai-agent";
import CampaignTestPage from "@/pages/campaign-test";
import IntelligentCampaignCreatePage from "@/pages/intelligent-campaign-create";
import PreviewStudioPage from "@/pages/preview-studio";
import VoiceSimulationPage from "@/pages/voice-simulation";
import EmailSimulationPage from "@/pages/email-simulation";

// Settings Hub Pages
import SettingsIndexPage from "@/pages/settings/index";
import ProfileSettingsPage from "@/pages/settings/profile";
import UsersSettingsPage from "@/pages/settings/users";
import TelephonySettingsPage from "@/pages/settings/telephony";
import VoiceEngineControlCenter from "@/pages/settings/voice-engine";
import AiGovernanceSettingsPage from "@/pages/settings/ai-governance";
import SuperOrgSettingsPage from "@/pages/settings/super-org";
import AgentDefaultsSettingsPage from "@/pages/agent-defaults-settings";
import PromptManagementPage from "@/pages/prompt-management";
import PromptInspectorPage from "@/pages/prompt-inspector";
import SmtpProvidersPage from "@/pages/smtp-providers";
import TransactionalTemplatesPage from "@/pages/transactional-templates";
import EmailManagementPage from "@/pages/email-management";
import MercuryNotificationsPage from "@/pages/mercury-notifications";
import DeliverabilityDashboardPage from "@/pages/deliverability-dashboard";
import BrandKitsPage from "@/pages/brand-kits";
import { EmailBuilderDnD } from "@/components/email-builder/EmailBuilderDnD";
import ContentPromoPublicPage from "@/pages/content-promo-public";
import ContentPromotionManagerPage from "@/pages/content-promotion-manager";
import OpsHubPage from "@/pages/ops-hub";

// IAM - Identity & Access Management
import IamOverview from "@/pages/iam/iam-overview";
import IamUsers from "@/pages/iam/iam-users";
import IamTeams from "@/pages/iam/iam-teams";
import IamRoles from "@/pages/iam/iam-roles";
import IamPolicies from "@/pages/iam/iam-policies";
import IamGrants from "@/pages/iam/iam-grants";
import IamRequests from "@/pages/iam/iam-requests";
import IamAudit from "@/pages/iam/iam-audit";
import IamSecrets from "@/pages/iam/iam-secrets";
import IamClientAccess from "@/pages/iam/iam-client-access";

const normalizeRole = (role: unknown): string | null => {
  if (typeof role === "string") {
    const trimmed = role.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  if (role && typeof role === "object" && "role" in role) {
    const value = (role as { role?: unknown }).role;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed.toLowerCase() : null;
    }
  }
  return null;
};

const normalizeRoles = (roles: unknown): string[] => {
  if (roles == null) {
    return [];
  }
  const roleList = Array.isArray(roles) ? roles : [roles];
  const normalized: string[] = [];

  roleList.forEach((role) => {
    const direct = normalizeRole(role);
    if (direct) {
      if (direct.includes(",") || direct.includes(" ")) {
        direct
          .split(/[,\s]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .forEach((entry) => normalized.push(entry.toLowerCase()));
      } else {
        normalized.push(direct);
      }
      return;
    }

    if (role && typeof role === "object" && "role" in role) {
      const nested = normalizeRole((role as { role?: unknown }).role);
      if (nested) {
        normalized.push(nested);
      }
    }
  });

  return normalized;
};

// Route guard component that checks permissions based on current route
function RouteGuard({ children, userRoles }: { children: React.ReactNode; userRoles: string[] }) {
  const [location, setLocation] = useLocation();

  // Check if user can access the current route
  const hasAccess = canAccessRoute(userRoles, location);

  if (!hasAccess) {
    return (
      
        
          
        
        Access Denied
        
          You don't have permission to access this page.
          Your current role{userRoles.length > 1 ? 's' : ''}: {userRoles.join(', ')}
        
        
          Please contact your administrator if you believe you should have access.
        
         setLocation('/')} variant="outline">
          
          Go to Dashboard
        
      
    );
  }

  return <>{children};
}

const parseJwtPayload = (token: string): Record | null => {
  const parts = token.split(".");
  if (parts.length ;
}


function AuthenticatedApp() {
  const { user, token, getToken } = useAuth();
  const [location] = useLocation();

  // Custom sidebar width for enterprise CRM
  const style = {
    "--sidebar-width": "18rem",       // 288px standard sidebar
    "--sidebar-width-icon": "4.5rem", // larger icon width for better visibility
  };

  // Get user roles array (support both legacy single role and new multi-role system)
  const rolesFromUser = normalizeRoles((user as any)?.roles);
  const rolesFromLegacy = normalizeRoles(user?.role);
  const authToken = token || getToken();
  const tokenPayload = authToken ? parseJwtPayload(authToken) : null;
  const rolesFromToken = normalizeRoles(tokenPayload?.roles ?? tokenPayload?.role);
  const userRoles = Array.from(new Set([
    ...rolesFromUser,
    ...rolesFromLegacy,
    ...rolesFromToken,
  ]));
  const resolvedUserRoles = userRoles.length > 0 ? userRoles : ['agent'];
  const primaryRole = resolvedUserRoles.includes('admin') ? 'admin' : resolvedUserRoles[0];
  const isOpsHubRoute = location.startsWith('/ops-hub');

  return (
    
      
        
        
          {!isOpsHubRoute && }
          
            {!isOpsHubRoute && (
              
            )}
            
              
            
              
              

              {/* Accounts & Contacts */}
              
              
              
              
              
              
              
              
              
              
              
              
              {/* Campaigns - Unified Hub */}
              
              
                
              
              
              
              
              
              
              
              {/* Email Campaigns - support both old /campaigns/email and new /email-campaigns paths */}
              
              
              
              
              
              
                
              
              
              
              
              
              
              
              
              {/* Phone Campaigns - redirects to main campaigns page */}
              
              {/* Use the full wizard for editing phone campaigns (with voice selection) */}
              
              {/* Unified 12-step wizard for creating AND editing telemarketing campaigns */}
              
              {/* Legacy redirects for /campaigns/telemarketing */}
              
                {() => { window.location.href = '/campaigns'; return null; }}
              
              {/* Intelligent Campaign Creation with AI */}
              
              {/* Use the full wizard for editing phone campaigns (with voice selection) */}
              
              
              {/* Support all phone campaign types with /campaigns/:type/edit/:id pattern - use wizard */}
              
              
              
              
              
              {/* Leads */}
              
              
              
              
                
              

              {/* Content & Marketing */}
              
              
              
              
              
              
              
              

              {/* Suppressions */}
              
              
              
              
              {/* Imports */}
              
              
              {/* Reports & Analytics */}
              
              {/* /call-intelligence route removed - page deprecated */}
              
                
              
              
                
              
              
                
              
              
                
              
              
                
              
              
                
              
              
                
              
              
                
              
              
                
              
              
              
              
                
              
              
                
              
              
              
              
              {/* Agent Console & Virtual Agents */}
              
              
              
              
              
              
              
              
              

              {/* Settings Hub */}
              
              
              
              
              
              
              
              
              
              
              
              
              
              
              
               } />
              
              
              
               } />
               } />

              {/* IAM - Identity & Access Management */}
              
              
              
              
              
              
              
              
              
              

              {/* Operations Hub - GCP Infrastructure Management Dashboard */}
              

              {/* Legacy settings routes (kept for backwards compatibility) */}
              
               } />
               } />
              
              
              {/* Resources (Admin) */}
              
              
              
              
              
              {/* Verification */}
              
              
              
              
              
              
              
              
              {/* Pipeline & CRM */}
              
              
              
              
              
              
              
              
              
              {/* AI Studio */}
              
              
              
              
                
              
              
                
              
              
              
              
              
              {/* Organization & Client Portal Management */}
              {() => { window.location.replace('/settings/super-org'); return null; }}
              
              
              
              
              
              
              
              {/* Testing & Development */}
              
              

              {/* Simulation Pages */}
              
              

              {/* AI Studio Dashboard (new) */}
              
                
              

              {/* ================================================
                  DEPRECATED ROUTES - Redirect to new locations
                  These routes are maintained for backwards compatibility
                  and will log deprecation warnings to the console.
                  ================================================ */}

              {/* Legacy SIP trunk settings → Settings Hub */}
              
                
              

              {/* Legacy user management → Settings Hub */}
              
                {/* Note: /user-management is still being used, redirect handled above */}
              

              {/* Settings Hub routes that go to specific pages */}
              
              
              
              
              

              {/* Verification routes consolidation */}
              
              
              

              {/* Data Integrity (placeholder for future) */}
              
                
              

              {/* Cloud Logs Monitoring */}
              
                Loading...}>
                  
                
              

              {/* 404 */}
              
              
              
            
          
          {/* Global AI Agent Side Panel */}
          
        
      
    
  );
}

function Router() {
  return (
    
      {/* ================================================
          PUBLIC ROUTES - No authentication required
          These pages are accessible to everyone
          ================================================ */}

      {/* Welcome page is the home page */}
      
        
      
      
        
      
      
      {/* UK Export Finance Campaign */}
      
        
      

      {/* Static public pages */}
      
        
      
      
        
      
      
        
      
      
        
      
      
        
      
      
        
      

      {/* Public Resources Centre - Announcements, Insights, eBooks, Solution Briefs, Webinars */}
      
        
      
      
        
      

      {/* Authentication */}
      
      

      {/* Public lead forms, booking, and content promotion */}
      
      
      

      {/* Client Portal public routes (login/join/invite) */}
      
      
      
      

      {/* ================================================
          PROTECTED ROUTES - Authentication required
          All admin and authenticated routes below
          ================================================ */}

      {/* Client Portal authenticated routes */}
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
            
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      
      
        
          
        
      

      {/* Client Portal catch-all — redirect unmatched /client-portal/ subpaths to dashboard */}
      
        
          
        
      

      {/* Admin routes that start with /client-portal- (not client portal routes) */}
      
        
          
        
      

      {/* Main dashboard */}
      
        
          
        
      

      {/* All other routes require authentication */}
      
        
          
        
      
    
  );
}

function App() {
  return (
    
      
        
          
            Loading page...}>
              
            
            
          
        
      
    
  );
}

export default App;