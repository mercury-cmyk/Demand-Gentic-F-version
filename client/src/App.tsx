import { Switch, Route, Redirect, useLocation } from "wouter";
import { lazy, Suspense } from "react";
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
import { CommandPalette } from "@/components/patterns/command-palette";
import { DeprecatedRedirect } from "@/components/deprecated-redirect";
import { ROUTES, DEPRECATED_ROUTES } from "@/lib/routes";
import { canAccessRoute } from "@/lib/route-permissions";
import { AgentPanelProvider, AgentSidePanel } from "@/components/agent-panel";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import LandingPage from "@/pages/landing";
import AboutPage from "@/pages/about";
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
import CampaignsPage from "@/pages/campaigns";
import CampaignCreatePage from "@/pages/campaign-create";
import EmailCampaignsPage from "@/pages/email-campaigns";
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
import ContentStudioPage from "@/pages/content-studio";
import AIContentGeneratorPage from "@/pages/ai-content-generator";
import SocialMediaPublisherPage from "@/pages/social-media-publisher";
import SuppressionsPage from "@/pages/suppressions";
import TelemarketingSuppressionListPage from "@/pages/telemarketing-suppression-list";
import OrdersPage from "@/pages/orders";
import ImportsPage from "@/pages/imports";
import ReportsPage from "@/pages/reports";
import CallReportsPage from "@/pages/call-reports";
import CallRecordingsPage from "@/pages/call-recordings";
import CallIntelligenceDashboard from "@/pages/call-intelligence-dashboard";

// Lazy-loaded components
const CloudLogsMonitor = lazy(() => import("./pages/cloud-logs-monitor"));
import CallReportsDetailsPage from "@/pages/call-reports-details";
import ConversationQualityPage from "@/pages/conversation-quality";
import EngagementAnalyticsPage from "@/pages/engagement-analytics";
import CampaignAnalyticsPage from "@/pages/campaign-analytics";
import VirtualAgentsPage from "@/pages/virtual-agents";
import UnifiedAgentConsolePage from "@/pages/unified-agent-console";
import SettingsPage from "@/pages/settings";
import UserManagementPage from "@/pages/user-management";
import EventsPage from "@/pages/events";
import ResourcesPage from "@/pages/resources";
import NewsPage from "@/pages/news";
import SenderProfilesPage from "@/pages/sender-profiles";
import SipTrunkSettingsPage from "@/pages/sip-trunk-settings";
import AgentConsolePage from "./pages/agent-console";
import ResourcesCentrePage from "@/pages/resources-centre";
import VerificationCampaignsPage from "@/pages/verification-campaigns";
import VerificationCampaignConfigPage from "@/pages/verification-campaign-config";
import VerificationCampaignStatsPage from "@/pages/verification-campaign-stats";
import VerificationConsolePage from "@/pages/verification-console";
import VerificationUploadPage from "@/pages/verification-upload";
import VerificationSuppressionUploadPage from "@/pages/verification-suppression-upload";
import PhoneBulkEditorPage from "@/pages/phone-bulk-editor";
import EmailValidationTest from "./pages/email-validation-test";
import PivotalPipelineManagementPage from "@/pages/pivotal-pipeline-management";
import PipelineManagementPage from "@/pages/pipeline-management";
import PipelineImportPage from "@/pages/pipeline-import";
import OpportunityDetailPage from "@/pages/opportunity-detail";
import EmailSequencesPage from "@/pages/email-sequences";
import InboxPage from "@/pages/inbox";
import AgentReportsDashboard from "@/pages/agent-reports-dashboard";
import LeadFormsPage from "@/pages/lead-forms";
import LeadFormPublicPage from "@/pages/lead-form-public";
import AIProjectCreatorPage from "@/pages/ai-project-creator";
import ClientPortalAdmin from "@/pages/client-portal-admin";
import ClientPortalOrderDetail from "@/pages/client-portal-order-detail";
import ClientPortalLogin from "@/pages/client-portal-login";
import ClientPortalJoin from "@/pages/client-portal-join";
import ClientPortalDashboard from "@/pages/client-portal-dashboard";
import ClientPortalSimulations from "@/pages/client-portal-simulations";
import ClientHierarchyManager from "@/pages/client-hierarchy-manager";
import QAReviewCenter from "@/pages/qa-review-center";
import CampaignRequestsPage from "@/pages/campaign-requests";
import OrganizationIntelligencePage from "@/pages/ai-studio/intelligence";
import AIAgentsPage from "@/pages/ai-studio/agents";
import AgenticCRMOperatorPage from "@/pages/ai-studio/operator";
import AgentPromptsPage from "@/pages/ai-studio/agent-prompts";
import IntelligenceStudioDashboard from "@/pages/ai-studio/dashboard";
import CampaignIntelligencePage from "@/pages/ai-studio/campaign-intelligence";
import AgentCommandCenter from "@/pages/agent-command-center";
import CreateAIAgentPage from "@/pages/create-ai-agent";
import CampaignTestPage from "@/pages/campaign-test";
import IntelligentCampaignCreatePage from "@/pages/intelligent-campaign-create";
import PreviewStudioPage from "@/pages/preview-studio";

// Settings Hub Pages
import SettingsIndexPage from "@/pages/settings/index";
import ProfileSettingsPage from "@/pages/settings/profile";
import UsersSettingsPage from "@/pages/settings/users";
import TelephonySettingsPage from "@/pages/settings/telephony";
import SuperOrgSettingsPage from "@/pages/settings/super-org";
import AgentDefaultsSettingsPage from "@/pages/agent-defaults-settings";
import UnifiedKnowledgeHubPage from "@/pages/unified-knowledge-hub";
import PromptManagementPage from "@/pages/prompt-management";
import SmtpProvidersPage from "@/pages/smtp-providers";
import TransactionalTemplatesPage from "@/pages/transactional-templates";
import DomainManagementPage from "@/pages/domain-management";
import DeliverabilityDashboardPage from "@/pages/deliverability-dashboard";
import BrandKitsPage from "@/pages/brand-kits";
import { EmailBuilderDnD } from "@/components/email-builder/EmailBuilderDnD";

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="bg-destructive/10 p-4 rounded-full mb-6">
          <Shield className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          You don't have permission to access this page.
          Your current role{userRoles.length > 1 ? 's' : ''}: <strong>{userRoles.join(', ')}</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Please contact your administrator if you believe you should have access.
        </p>
        <Button onClick={() => setLocation('/')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  try {
    const json = atob(padded);
    return JSON.parse(json);
  } catch (error) {
    console.warn("[AUTH] Failed to parse JWT payload:", error);
    return null;
  }
};

function AuthenticatedApp() {
  const { user, token, getToken } = useAuth();

  // Custom sidebar width for enterprise CRM
  const style = {
    "--sidebar-width": "18rem",       // 288px standard sidebar
    "--sidebar-width-icon": "3rem",   // default icon width
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

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <AgentPanelProvider userRole={primaryRole} isClientPortal={false}>
        <CommandPalette />
        <div className="flex h-screen w-full">
          <AppSidebar userRoles={resolvedUserRoles} />
          <div className="flex flex-col flex-1 overflow-hidden">
            <TopBar
              userName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.username || 'User'}
              userRoles={resolvedUserRoles}
            />
            <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background">
              <RouteGuard userRoles={resolvedUserRoles}>
            <Switch>
              <Route path="/" component={Dashboard} />
              
              {/* Accounts & Contacts */}
              <Route path="/accounts" component={AccountsPage} />
              <Route path="/accounts/:id" component={AccountDetailPage} />
              <Route path="/accounts-list/:id" component={AccountsListDetail} />
              <Route path="/contacts" component={ContactsPage} />
              <Route path="/contacts/:id" component={ContactDetailPage} />
              <Route path="/segments" component={SegmentsPage} />
              <Route path="/segments/:id" component={SegmentDetailPage} />
              <Route path="/segments/lists/:id" component={ListDetailPage} />
              <Route path="/lists/:id" component={ListDetailPage} />
              <Route path="/domain-sets" component={DomainSetsPage} />
              <Route path="/domain-sets/:id" component={AccountsListDetail} />
              
              {/* Campaigns - Unified Hub */}
              <Route path="/campaigns" component={CampaignsPage} />
              <Route path="/campaigns/create" component={CampaignCreatePage} />
              <Route path="/campaigns/:campaignId/test" component={CampaignTestPage} />
              <Route path="/campaigns/:id/config" component={CampaignConfigPage} />
              <Route path="/campaigns/:id/suppressions" component={CampaignSuppressionsPage} />
              <Route path="/campaigns/:id/queue" component={CampaignQueuePage} />
              
              {/* Email Campaigns - support both old /campaigns/email and new /email-campaigns paths */}
              <Route path="/campaigns/email" component={EmailCampaignsPage} />
              <Route path="/campaigns/email/create" component={SimpleEmailCampaignCreatePage} />
              <Route path="/campaigns/email/create-legacy" component={EmailCampaignCreatePage} />
              <Route path="/campaigns/email/:id/edit" component={SimpleEmailCampaignEditPage} />
              <Route path="/campaigns/email/:id/reports" component={EmailCampaignReportsPage} />
              <Route path="/campaigns/email-templates" component={EmailTemplatesPage} />
              <Route path="/email-campaigns" component={EmailCampaignsPage} />
              <Route path="/email-campaigns/create" component={EmailCampaignCreatePage} />
              <Route path="/simple-email-campaigns/create" component={SimpleEmailCampaignCreatePage} />
              <Route path="/simple-email-campaigns/:id/edit" component={SimpleEmailCampaignEditPage} />
              <Route path="/email-campaigns/:id/reports" component={EmailCampaignReportsPage} />
              <Route path="/email-templates" component={EmailTemplatesPage} />
              <Route path="/email-sequences" component={EmailSequencesPage} />
              
              {/* Phone Campaigns - redirects to main campaigns page */}
              <Route path="/phone-campaigns">
                {() => { window.location.href = '/campaigns'; return null; }}
              </Route>
              <Route path="/phone-campaigns/create" component={TelemarketingCreatePage} />
              <Route path="/phone-campaigns/:id/edit" component={PhoneCampaignEditPage} />
              {/* Legacy redirects for /campaigns/telemarketing */}
              <Route path="/campaigns/telemarketing">
                {() => { window.location.href = '/campaigns'; return null; }}
              </Route>
              <Route path="/campaigns/telemarketing/create">
                {() => { window.location.href = '/campaigns'; return null; }}
              </Route>
              {/* Intelligent Campaign Creation with AI */}
              <Route path="/campaigns/create/intelligent" component={IntelligentCampaignCreatePage} />
              {/* Added explicit routes for /campaigns/phone path used in navigations */}
              <Route path="/campaigns/phone">
                {() => { window.location.href = '/campaigns'; return null; }}
              </Route>
              <Route path="/campaigns/phone/:id/edit" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/phone/:id/queue" component={CampaignQueuePage} />
              {/* Support all phone campaign types with /campaigns/:type/edit/:id pattern */}
              <Route path="/campaigns/appointment_generation/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/lead_qualification/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/survey/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/follow_up/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/event_registration/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/reactivation/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/sql/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/campaigns/webinar_invite/edit/:id" component={PhoneCampaignEditPage} />
              <Route path="/telemarketing/create" component={TelemarketingCreatePage} />
              <Route path="/phone-bulk-editor" component={PhoneBulkEditorPage} />
              
              {/* Leads */}
              <Route path="/leads" component={LeadsPage} />
              <Route path="/leads/:id" component={LeadDetailPage} />
              <Route path="/lead-forms" component={LeadFormsPage} />
              <Route path="/conversation-quality" component={ConversationQualityPage} />

              {/* Content & Marketing */}
              <Route path="/content-studio" component={ContentStudioPage} />
              <Route path="/content-studio/ai-generator" component={AIContentGeneratorPage} />
              <Route path="/content-studio/social-publisher" component={SocialMediaPublisherPage} />
              <Route path="/ai-content-generator" component={AIContentGeneratorPage} />
              <Route path="/social-media-publisher" component={SocialMediaPublisherPage} />
              
              {/* Suppressions */}
              <Route path="/suppressions" component={SuppressionsPage} />
              <Route path="/telemarketing/suppressions" component={TelemarketingSuppressionListPage} />
              <Route path="/telemarketing-suppression-list" component={TelemarketingSuppressionListPage} />
              
              {/* Orders & Imports */}
              <Route path="/orders" component={OrdersPage} />
              <Route path="/imports" component={ImportsPage} />
              
              {/* Reports & Analytics */}
              <Route path="/reports" component={ReportsPage} />
              <Route path="/call-reports" component={CallReportsPage} />
              <Route path="/call-reports/:id" component={CallReportsDetailsPage} />
              <Route path="/call-recordings" component={CallRecordingsPage} />
              <Route path="/call-intelligence" component={CallIntelligenceDashboard} />
              <Route path="/engagement-analytics" component={EngagementAnalyticsPage} />
              <Route path="/campaign-analytics" component={CampaignAnalyticsPage} />
              <Route path="/ai-call-analytics">
                <Redirect to="/call-reports?tab=ai" />
              </Route>
              <Route path="/agent-reports-dashboard" component={AgentReportsDashboard} />
              
              {/* Agent Console & Virtual Agents */}
              <Route path="/agent-console" component={AgentConsolePage} />
              <Route path="/unified-agent-console" component={UnifiedAgentConsolePage} />
              <Route path="/agent-command-center" component={AgentCommandCenter} />
              <Route path="/virtual-agents" component={VirtualAgentsPage} />
              <Route path="/virtual-agents/create" component={CreateAIAgentPage} />
              <Route path="/agent-reports" component={AgentReportsDashboard} />
              <Route path="/settings/agent-defaults" component={AgentDefaultsSettingsPage} />
              <Route path="/settings/knowledge-hub" component={UnifiedKnowledgeHubPage} />
              <Route path="/settings/prompts" component={PromptManagementPage} />

              {/* Settings Hub */}
              <Route path="/settings" component={SettingsIndexPage} />
              <Route path="/settings/profile" component={ProfileSettingsPage} />
              <Route path="/settings/users" component={UsersSettingsPage} />
              <Route path="/settings/telephony" component={TelephonySettingsPage} />
              <Route path="/settings/custom-fields" component={SettingsPage} />
              <Route path="/settings/notifications" component={SettingsPage} />
              <Route path="/settings/security" component={SettingsPage} />
              <Route path="/settings/integrations" component={SettingsPage} />
              <Route path="/settings/background-jobs" component={SettingsPage} />
              <Route path="/settings/compliance" component={SettingsPage} />
              <Route path="/settings/super-org" component={SuperOrgSettingsPage} />
              <Route path="/settings/smtp-providers" component={SmtpProvidersPage} />
              <Route path="/settings/transactional-templates" component={TransactionalTemplatesPage} />
              <Route path="/settings/domain-management" component={DomainManagementPage} />
              <Route path="/settings/deliverability" component={DeliverabilityDashboardPage} />
              <Route path="/settings/brand-kits" component={BrandKitsPage} />
              <Route path="/email-builder" component={() => <EmailBuilderDnD />} />
              <Route path="/email-builder/:templateId" component={() => <EmailBuilderDnD />} />

              {/* IAM - Identity & Access Management */}
              <Route path="/iam" component={IamOverview} />
              <Route path="/iam/users" component={IamUsers} />
              <Route path="/iam/teams" component={IamTeams} />
              <Route path="/iam/roles" component={IamRoles} />
              <Route path="/iam/policies" component={IamPolicies} />
              <Route path="/iam/grants" component={IamGrants} />
              <Route path="/iam/requests" component={IamRequests} />
              <Route path="/iam/audit" component={IamAudit} />
              <Route path="/iam/secrets" component={IamSecrets} />

              {/* Legacy settings routes (kept for backwards compatibility) */}
              <Route path="/user-management" component={UsersSettingsPage} />
              <Route path="/sender-profiles" component={SenderProfilesPage} />
              <Route path="/email-infrastructure/sender-profiles" component={SenderProfilesPage} />
              <Route path="/telephony/sip-trunks" component={TelephonySettingsPage} />
              
              {/* Resources */}
              <Route path="/events" component={EventsPage} />
              <Route path="/resources" component={ResourcesPage} />
              <Route path="/resources-centre" component={ResourcesCentrePage} />
              <Route path="/news" component={NewsPage} />
              
              {/* Verification */}
              <Route path="/verification-campaigns" component={VerificationCampaignsPage} />
              <Route path="/verification-campaigns/:id/config" component={VerificationCampaignConfigPage} />
              <Route path="/verification-campaigns/:id/stats" component={VerificationCampaignStatsPage} />
              <Route path="/verification-console" component={VerificationConsolePage} />
              <Route path="/verification-upload" component={VerificationUploadPage} />
              <Route path="/verification-suppression-upload" component={VerificationSuppressionUploadPage} />
              <Route path="/email-validation-test" component={EmailValidationTest} />
              
              {/* Pipeline & CRM */}
              <Route path="/pipeline" component={PipelineManagementPage} />
              <Route path="/pipeline/pivotal" component={PivotalPipelineManagementPage} />
              <Route path="/pipeline/import" component={PipelineImportPage} />
              <Route path="/pipeline/lead-forms" component={LeadFormsPage} />
              <Route path="/pivotal-pipeline-management" component={PivotalPipelineManagementPage} />
              <Route path="/pipeline-import" component={PipelineImportPage} />
              <Route path="/opportunities/:id" component={OpportunityDetailPage} />
              <Route path="/inbox" component={InboxPage} />
              
              {/* AI Studio */}
              <Route path="/ai-project-creator" component={AIProjectCreatorPage} />
              <Route path="/ai-studio/dashboard" component={IntelligenceStudioDashboard} />
              <Route path="/ai-studio/intelligence" component={OrganizationIntelligencePage} />
              <Route path="/ai-studio/agents" component={AIAgentsPage} />
              <Route path="/ai-studio/operator" component={AgenticCRMOperatorPage} />
              <Route path="/ai-studio/agent-prompts" component={AgentPromptsPage} />
              <Route path="/ai-studio/campaign-intelligence" component={CampaignIntelligencePage} />
              <Route path="/create-ai-agent" component={CreateAIAgentPage} />
              
              {/* Client Portal & Hierarchy Management */}
              <Route path="/client-portal-admin" component={ClientPortalAdmin} />
              <Route path="/client-portal/orders/:id" component={ClientPortalOrderDetail} />
              <Route path="/client-hierarchy-manager" component={ClientHierarchyManager} />
              <Route path="/qa-review-center" component={QAReviewCenter} />
              <Route path="/campaign-requests" component={CampaignRequestsPage} />
              
              {/* Testing & Development */}
              <Route path="/campaign-test" component={CampaignTestPage} />
              <Route path="/preview-studio" component={PreviewStudioPage} />

              {/* AI Studio Dashboard (new) */}
              <Route path="/ai-studio">
                <Redirect to="/ai-studio/dashboard" />
              </Route>

              {/* ================================================
                  DEPRECATED ROUTES - Redirect to new locations
                  These routes are maintained for backwards compatibility
                  and will log deprecation warnings to the console.
                  ================================================ */}

              {/* Legacy SIP trunk settings → Settings Hub */}
              <Route path="/sip-trunk-settings">
                <DeprecatedRedirect routeKey="SIP_TRUNK_SETTINGS" />
              </Route>

              {/* Legacy user management → Settings Hub */}
              <Route path="/user-management">
                {/* Note: /user-management is still being used, redirect handled above */}
              </Route>

              {/* Settings Hub routes that go to specific pages */}
              <Route path="/settings/profile" component={SettingsPage} />
              <Route path="/settings/custom-fields" component={SettingsPage} />
              <Route path="/settings/notifications" component={SettingsPage} />
              <Route path="/settings/security" component={SettingsPage} />
              <Route path="/settings/background-jobs" component={SettingsPage} />

              {/* Verification routes consolidation */}
              <Route path="/verification/campaigns" component={VerificationCampaignsPage} />
              <Route path="/verification/campaigns/:id/config" component={VerificationCampaignConfigPage} />
              <Route path="/verification/console" component={VerificationConsolePage} />

              {/* Data Integrity (placeholder for future) */}
              <Route path="/data-integrity">
                <Redirect to="/verification/campaigns" />
              </Route>

              {/* Cloud Logs Monitoring */}
              <Route path="/cloud-logs">
                <Suspense fallback={<div className="p-4">Loading...</div>}>
                  <CloudLogsMonitor />
                </Suspense>
              </Route>

              {/* 404 */}
              <Route component={NotFound} />
              </Switch>
              </RouteGuard>
            </main>
          </div>
          {/* Global AI Agent Side Panel */}
          <AgentSidePanel />
        </div>
      </AgentPanelProvider>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/welcome" component={LandingPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/forms/:id" component={LeadFormPublicPage} />
      <Route path="/client-portal/login" component={ClientPortalLogin} />
      <Route path="/client-portal/join/:slug" component={ClientPortalJoin} />
      <Route path="/client-portal/dashboard" component={ClientPortalDashboard} />
      <Route path="/client-portal/simulations" component={ClientPortalSimulations} />
      <Route>
        <ProtectedRoute>
          <AuthenticatedApp />
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
