import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
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
import EmailCampaignsPage from "@/pages/email-campaigns";
import EmailCampaignCreatePage from "@/pages/email-campaign-create";
import SimpleEmailCampaignCreatePage from "@/pages/simple-email-campaign-create";
import SimpleEmailCampaignEditPage from "@/pages/simple-email-campaign-edit";
import EmailCampaignReportsPage from "@/pages/email-campaign-reports";
import EmailTemplatesPage from "@/pages/email-templates";
import TelemarketingCreatePage from "@/pages/telemarketing-create";
import PhoneCampaignsPage from "@/pages/phone-campaigns";
import PhoneCampaignEditPage from "@/pages/phone-campaign-edit";
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
import CallReportsDetailsPage from "@/pages/call-reports-details";
import EngagementAnalyticsPage from "@/pages/engagement-analytics";
import CampaignAnalyticsPage from "@/pages/campaign-analytics";
import AiCallAnalyticsPage from "@/pages/ai-call-analytics";
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
import { useSIPWebRTC } from "./hooks/useTelnyxWebRTC";
import ResourcesCentrePage from "@/pages/resources-centre";
import CampaignQueuePage from "@/pages/campaign-queue";
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
import ClientPortalDashboard from "@/pages/client-portal-dashboard";
import OrganizationIntelligencePage from "@/pages/ai-studio/intelligence";
import AIAgentsPage from "@/pages/ai-studio/agents";
import AgenticCRMOperatorPage from "@/pages/ai-studio/operator";
import AgentCommandCenter from "@/pages/agent-command-center";
import CreateAIAgentPage from "@/pages/create-ai-agent";
import CampaignTestPage from "@/pages/campaign-test";
import PreviewStudioPage from "@/pages/preview-studio";
import WebRTCTestPage from "@/pages/webrtc-test";
import CampaignRunnerPage from "@/pages/campaign-runner";

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

  // Example SIP credentials (replace with env/config)
  const sipUri = import.meta.env.VITE_SIP_URI || "sip:your-username@sip.example.com";
  const sipPassword = import.meta.env.VITE_SIP_PASSWORD || "yourpassword";
  const sipWebSocket = import.meta.env.VITE_SIP_WEBSOCKET || "wss://sip.example.com:7443";

  // JsSIP hook
  const sip = useSIPWebRTC({
    sipUri,
    sipPassword,
    sipWebSocket,
    onCallStateChange: (state) => {
      console.log("SIP Call State:", state);
    },
    onCallEnd: () => {
      console.log("SIP Call Ended");
    },
  });

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

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <CommandPalette />
      <div className="flex h-screen w-full">
        <AppSidebar userRoles={resolvedUserRoles} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar
            userName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.username || 'User'}
            userRoles={resolvedUserRoles}
          />
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-background">
            {/* JsSIP SIP/WebRTC Example UI */}
            <div style={{ marginBottom: 16 }}>
              <h3>SIP Call (JsSIP)</h3>
              <button onClick={() => sip.makeCall("sip:destination@sip.example.com")}>Call Destination</button>
              <button onClick={sip.hangup} style={{ marginLeft: 8 }}>Hangup</button>
              <div>Call State: {sip.callState}</div>
              <audio ref={sip.remoteAudioRef} id="remoteAudio" autoPlay />
            </div>
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
              
              {/* Campaigns */}
              <Route path="/campaigns" component={CampaignsPage} />
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
              
              {/* Phone Campaigns - support both old /campaigns/telemarketing and new paths */}
              <Route path="/campaigns/telemarketing" component={PhoneCampaignsPage} />
              <Route path="/campaigns/telemarketing/create" component={TelemarketingCreatePage} />
              <Route path="/phone-campaigns" component={PhoneCampaignsPage} />
              <Route path="/phone-campaigns/:id/edit" component={PhoneCampaignEditPage} />
              <Route path="/telemarketing/create" component={TelemarketingCreatePage} />
              <Route path="/phone-bulk-editor" component={PhoneBulkEditorPage} />
              
              {/* Leads */}
              <Route path="/leads" component={LeadsPage} />
              <Route path="/leads/:id" component={LeadDetailPage} />
              <Route path="/lead-forms" component={LeadFormsPage} />
              
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
              <Route path="/engagement-analytics" component={EngagementAnalyticsPage} />
              <Route path="/campaign-analytics" component={CampaignAnalyticsPage} />
              <Route path="/ai-call-analytics" component={AiCallAnalyticsPage} />
              <Route path="/agent-reports-dashboard" component={AgentReportsDashboard} />
              
              {/* Agent Console & Virtual Agents */}
              <Route path="/agent-console" component={AgentConsolePage} />
              <Route path="/unified-agent-console" component={UnifiedAgentConsolePage} />
              <Route path="/agent-command-center" component={AgentCommandCenter} />
              <Route path="/campaign-runner" component={CampaignRunnerPage} />
              <Route path="/virtual-agents" component={VirtualAgentsPage} />
              <Route path="/virtual-agents/create" component={CreateAIAgentPage} />
              <Route path="/agent-reports" component={AgentReportsDashboard} />
              
              {/* Settings & Administration */}
              <Route path="/settings" component={SettingsPage} />
              <Route path="/settings/telephony" component={SipTrunkSettingsPage} />
              <Route path="/settings/users" component={UserManagementPage} />
              <Route path="/settings/compliance" component={SettingsPage} />
              <Route path="/settings/integrations" component={SettingsPage} />
              <Route path="/user-management" component={UserManagementPage} />
              <Route path="/sender-profiles" component={SenderProfilesPage} />
              <Route path="/email-infrastructure/sender-profiles" component={SenderProfilesPage} />
              <Route path="/telephony/sip-trunks" component={SipTrunkSettingsPage} />
              
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
              <Route path="/ai-studio/intelligence" component={OrganizationIntelligencePage} />
              <Route path="/ai-studio/agents" component={AIAgentsPage} />
              <Route path="/ai-studio/operator" component={AgenticCRMOperatorPage} />
              <Route path="/create-ai-agent" component={CreateAIAgentPage} />
              
              {/* Client Portal */}
              <Route path="/client-portal-admin" component={ClientPortalAdmin} />
              <Route path="/client-portal/orders/:id" component={ClientPortalOrderDetail} />
              
              {/* Testing & Development */}
              <Route path="/campaign-test" component={CampaignTestPage} />
              <Route path="/preview-studio" component={PreviewStudioPage} />
              <Route path="/webrtc-test" component={WebRTCTestPage} />
              
              {/* 404 */}
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/forms/:id" component={LeadFormPublicPage} />
      <Route path="/client-portal/login" component={ClientPortalLogin} />
      <Route path="/client-portal/dashboard" component={ClientPortalDashboard} />
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
