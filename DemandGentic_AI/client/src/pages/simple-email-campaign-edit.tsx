import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailPreview } from "@/components/email-builder";
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";
import {
  buildBrandedEmailHtml,
  buildTextFirstEmailHtml,
  type BrandPaletteKey,
  type BrandPaletteOverrides,
} from "@/components/email-builder/ai-email-template";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  Loader2,
  Mail,
  Plus,
  Send,
  Trash2,
  X,
  Target,
  Users,
  Sparkles,
  Link as LinkIcon,
} from "lucide-react";

type WizardChannel = "email" | "combo";

interface CampaignRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  projectId: string | null;
  clientAccountId: string | null;
  campaignObjective: string | null;
  productServiceInfo: string | null;
  targetAudienceDescription: string | null;
  successCriteria: string | null;
  landingPageUrl: string | null;
  audienceRefs?: any;
  enabledChannels?: string[] | null;
  senderProfileId?: string | null;
  senderName?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  campaignProviderId?: string | null;
  campaignProviderKey?: string | null;
  campaignProviderName?: string | null;
  campaignProviderHealthStatus?: string | null;
  domainAuthId?: number | null;
  domainName?: string | null;
}

interface ProjectRequestRecord {
  id: string;
  name: string;
  clientAccountId?: string | null;
  description: string | null;
  projectType?: string | null;
  landingPageUrl: string | null;
  requestedLeadCount: number | null;
  externalEventId: string | null;
  eventTitle?: string | null;
  eventCommunity?: string | null;
  eventType?: string | null;
  eventLocation?: string | null;
  eventDate?: string | null;
  eventSourceUrl?: string | null;
}

interface AdminOrderRow {
  order: {
    id: string;
    clientAccountId: string;
    projectId: string | null;
    campaignId: string | null;
    status: string;
    title: string | null;
    description: string | null;
    targetLeadCount: number | null;
    targetTitles: string[] | null;
    targetIndustries: string[] | null;
    campaignConfig: any;
    createdAt: string;
  };
}

interface ClientAccountRecord {
  id: string;
  name: string;
  companyName?: string | null;
}

interface ClientProjectRecord {
  id: string;
  name: string;
  status?: string | null;
  description?: string | null;
  clientAccountId?: string | null;
  campaignOrganizationId?: string | null;
}

interface ManagedSenderProfile {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  replyToEmail?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
  domainAuthId?: number | null;
  campaignProviderId?: string | null;
  campaignProvider?: {
    id?: string | null;
    name?: string | null;
    providerKey?: string | null;
    healthStatus?: string | null;
  } | null;
}

interface SegmentRecord {
  id: string;
  name: string;
  entityType?: string | null;
  recordCountCache?: number | null;
}

interface ListRecord {
  id: string;
  name: string;
  entityType?: string | null;
  recordIds?: string[] | null;
}

interface ListContactRecord {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  accountName?: string | null;
  account?: { name?: string | null } | null;
}

type AudienceSource = "segment" | "list";
type TemplateTone = "professional" | "friendly" | "direct";
type TemplateDesign = "plain" | "branded" | "newsletter" | "argyle-brand";

interface PersistedAdminAudienceConfig {
  source?: AudienceSource;
  segmentId?: string | null;
  segmentName?: string | null;
  listId?: string | null;
  listName?: string | null;
  excludedContactIds?: string[];
  totalContacts?: number | null;
  includedContacts?: number | null;
  excludedContacts?: number | null;
}

interface PersistedAdminEmailTemplateConfig {
  tone?: TemplateTone;
  design?: TemplateDesign;
  subject?: string;
  preheader?: string;
  bodyText?: string;
  bodyHtml?: string;
  promptSource?: string;
  promptKey?: string | null;
  personalizationTokens?: string[];
}

interface GeneratedAdminEmailTemplateResponse {
  success: boolean;
  template?: {
    subject?: string;
    preheader?: string;
    bodyText?: string;
    bodyHtml?: string;
    promptSource?: string;
    promptKeyUsed?: string | null;
    usedFallback?: boolean;
  };
}

interface TestSendRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job_title: string;
  status: "idle" | "invalid" | "sending" | "sent" | "failed";
  message?: string;
  sentAt?: string;
}

interface PersistedAdminEmailTestSendConfig {
  rows?: Array;
  lastAttemptAt?: string | null;
  sentCount?: number;
  failedCount?: number;
}

interface EditFormState {
  channel: WizardChannel;
  name: string;
  objective: string;
  description: string;
  targetAudience: string;
  successCriteria: string;
  targetJobTitles: string[];
  targetIndustries: string[];
  landingPageUrl: string;
}

interface OrganizationIntelligenceResponse {
  organization: any | null;
  campaigns?: Array;
  isPrimary?: boolean;
  message?: string;
}

interface AdminBrandPaletteResponse {
  palette: {
    key: string;
    source: "website-css" | "fallback";
    website: string;
    primary: string;
    secondary: string;
    neutral: string;
    overrides: BrandPaletteOverrides;
  };
  fallback?: {
    key: string;
    source: "fallback";
    website: string;
    primary: string;
    secondary: string;
    neutral: string;
    overrides: BrandPaletteOverrides;
  };
}

type AutofillFieldKey =
  | "description"
  | "targetAudience"
  | "successCriteria"
  | "targetJobTitles"
  | "targetIndustries"
  | "landingPageUrl";

interface AutofillCandidate {
  key: AutofillFieldKey;
  label: string;
  currentValue: string | string[];
  suggestedValue: string | string[];
}

interface TemplateSampleContact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  jobTitle: string;
}

const STEPS = [
  { id: "channel", label: "Channel", icon: Sparkles },
  { id: "basics", label: "Basics", icon: FileText },
  { id: "details", label: "Details", icon: Target },
  { id: "audience", label: "Audience", icon: Users },
  { id: "email-template", label: "Email Template", icon: Mail },
  { id: "test-send", label: "Test Send", icon: Send },
  { id: "review", label: "Review", icon: CheckCircle2 },
] as const;

const DEFAULT_FORM: EditFormState = {
  channel: "email",
  name: "",
  objective: "",
  description: "",
  targetAudience: "",
  successCriteria: "",
  targetJobTitles: [],
  targetIndustries: [],
  landingPageUrl: "",
};

const DEFAULT_TEMPLATE_TONE: TemplateTone = "professional";
const DEFAULT_TEMPLATE_DESIGN: TemplateDesign = "plain";
const DEFAULT_ARGYLE_BRAND_OVERRIDES: BrandPaletteOverrides = {
  heroGradient: "linear-gradient(135deg, #1f5f95 0%, #4e9fd1 60%, #f3f7fb 100%)",
  cta: "#1f5f95",
  accent: "#4e9fd1",
  surface: "#f3f7fb",
  button: "#1f5f95",
};
const SUPPORTED_PERSONALIZATION_TOKENS = [
  "{{firstName}}",
  "{{lastName}}",
  "{{fullName}}",
  "{{company}}",
  "{{email}}",
  "{{jobTitle}}",
  "{{unsubscribe_url}}",
  "{{preferences_url}}",
];
const EMPTY_LIST_MEMBERS: ListContactRecord[] = [];

function getTemplateDesignLabel(design: TemplateDesign): string {
  if (design === "argyle-brand") return "Argyle Brand";
  return design[0].toUpperCase() + design.slice(1);
}

function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeLooseArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && typeof (item as any).title === "string") {
          return (item as any).title.trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function ensureAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.includes(".")) return `https://${trimmed}`;
  return "";
}

function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(//g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyTextToHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `${escapeHtmlValue(paragraph).replace(/\n/g, "")}`)
    .join("");
}

function withExternalAnchorTargets(html: string): string {
  return html.replace(/]*)>/gi, (_match, attrs: string) => {
    const hasTarget = /\btarget\s*=/.test(attrs);
    const hasRel = /\brel\s*=/.test(attrs);
    const nextAttrs = `${attrs}${hasTarget ? "" : ' target="_blank"'}${hasRel ? "" : ' rel="noopener noreferrer"'}`;
    return ``;
  });
}

function createTestSendRow(partial?: Partial): TestSendRow {
  const rowId =
    typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `test-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: rowId,
    first_name: "",
    last_name: "",
    email: "",
    company: "",
    job_title: "",
    status: "idle",
    ...partial,
  };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function replaceTemplateTokens(template: string, sample: TemplateSampleContact): string {
  return template
    .replace(/\{\{firstName\}\}/g, sample.firstName)
    .replace(/\{\{lastName\}\}/g, sample.lastName)
    .replace(/\{\{fullName\}\}/g, `${sample.firstName} ${sample.lastName}`.trim())
    .replace(/\{\{company\}\}/g, sample.company)
    .replace(/\{\{email\}\}/g, sample.email)
    .replace(/\{\{jobTitle\}\}/g, sample.jobTitle)
    .replace(/\{\{unsubscribe_url\}\}/g, "#unsubscribe")
    .replace(/\{\{preferences_url\}\}/g, "#preferences");
}

function generateTemplateVariant(args: {
  tone: TemplateTone;
  design: TemplateDesign;
  campaignName: string;
  objective: string;
  description: string;
  landingPageUrl: string;
  targetAudience: string;
  orgName: string;
  paletteOverrides?: BrandPaletteOverrides;
}): { subject: string; preheader: string; bodyText: string; bodyHtml: string } {
  const {
    tone,
    design,
    campaignName,
    objective,
    description,
    landingPageUrl,
    targetAudience,
    orgName,
    paletteOverrides,
  } = args;

  const safeCampaignName = campaignName.trim() || "Email Outreach Campaign";
  const safeObjective = objective.trim() || "share a relevant idea that creates qualified pipeline conversations";
  const safeDescription = description.trim();
  const safeAudience = targetAudience.trim();
  const ctaUrl = ensureAbsoluteUrl(landingPageUrl) || "#";

  const subjectByTone: Record = {
    professional: `${safeCampaignName}: a relevant idea for {{company}}`,
    friendly: `Quick thought for {{company}}, {{firstName}}`,
    direct: `{{firstName}}, quick win for {{company}}`,
  };
  const preheaderByTone: Record = {
    professional: `Focused outreach for ${safeObjective}.`,
    friendly: `Quick note on ${safeObjective}.`,
    direct: `Fast path to ${safeObjective}.`,
  };

  const openerByTone: Record = {
    professional: "Hi {{firstName}},",
    friendly: "Hi {{firstName}}, hope you're doing well.",
    direct: "Hi {{firstName}},",
  };

  const closeByTone: Record = {
    professional: "If this is relevant, I can share a short plan tailored to {{company}}.",
    friendly: "If helpful, I can send a short plan tailored to {{company}}.",
    direct: "If useful, I can send a focused plan for {{company}}.",
  };

  const ctaByTone: Record = {
    professional: "View Brief",
    friendly: "Take a Quick Look",
    direct: "Open Brief",
  };

  const bodySections = [
    openerByTone[tone],
    `I'm reaching out because we're focused on ${safeObjective}.`,
    safeDescription || "This campaign is aimed at high-intent contacts and decision makers who match your ICP.",
    safeAudience ? `Best-fit audience: ${safeAudience}.` : "",
    closeByTone[tone],
  ].filter(Boolean);

  const bodyText = bodySections.join("\n\n");

  if (design === "plain") {
    const bodyHtml = buildTextFirstEmailHtml({
      body: bodyTextToHtml(bodyText),
      organizationName: orgName || "Your Organization",
      organizationAddress: "",
      ctaText: ctaByTone[tone],
      ctaUrl,
    });
    return {
      subject: subjectByTone[tone],
      preheader: preheaderByTone[tone],
      bodyText,
      bodyHtml,
    };
  }

  const brandPalette: BrandPaletteKey = design === "newsletter" ? "emerald" : "indigo";
  const brandedHtml = buildBrandedEmailHtml({
    brand: brandPalette,
    companyName: orgName || "Your Organization",
    ctaUrl,
    paletteOverrides,
    copy: {
      subject: subjectByTone[tone],
      heroTitle: safeCampaignName,
      heroSubtitle:
        tone === "friendly"
          ? "A practical note tailored to your team"
          : tone === "direct"
            ? "Focused outreach with clear conversion intent"
            : "A concise outreach framework for qualified pipeline",
      intro: bodyText,
      valueBullets: [
        safeObjective,
        safeAudience || "Audience aligned with your ideal customer profile",
        "Personalized outreach with measurable response goals",
      ],
      ctaLabel: ctaByTone[tone],
      closingLine: "You can edit this template before launch.",
    },
  });

  return {
    subject: subjectByTone[tone],
    preheader: preheaderByTone[tone],
    bodyText,
    bodyHtml: brandedHtml,
  };
}

function buildTemplateHtmlFromInputs(args: {
  tone: TemplateTone;
  design: TemplateDesign;
  subject: string;
  bodyText: string;
  objective: string;
  targetAudience: string;
  landingPageUrl: string;
  orgName: string;
  paletteOverrides?: BrandPaletteOverrides;
}): string {
  const { tone, design, subject, bodyText, objective, targetAudience, landingPageUrl, orgName, paletteOverrides } = args;
  const ctaUrl = ensureAbsoluteUrl(landingPageUrl) || "#";
  const ctaByTone: Record = {
    professional: "View Brief",
    friendly: "Take a Quick Look",
    direct: "Open Brief",
  };

  if (design === "plain") {
    return buildTextFirstEmailHtml({
      body: bodyTextToHtml(bodyText),
      organizationName: orgName || "Your Organization",
      organizationAddress: "",
      ctaText: ctaByTone[tone],
      ctaUrl,
    });
  }

  const brandPalette: BrandPaletteKey = design === "newsletter" ? "emerald" : "indigo";
  return buildBrandedEmailHtml({
    brand: brandPalette,
    companyName: orgName || "Your Organization",
    ctaUrl,
    paletteOverrides,
    copy: {
      subject,
      heroTitle: subject || "Email Campaign",
      heroSubtitle:
        tone === "friendly"
          ? "A practical note tailored to your team"
          : tone === "direct"
            ? "Focused outreach with clear conversion intent"
            : "A concise outreach framework for qualified pipeline",
      intro: bodyText,
      valueBullets: [
        objective.trim() || "Generate qualified pipeline conversations.",
        targetAudience.trim() || "Audience aligned with your ideal customer profile.",
        "Personalized outreach with measurable response goals.",
      ],
      ctaLabel: ctaByTone[tone],
      closingLine: "You can edit this template before launch.",
    },
  });
}

function getRouteCampaignId(): string | null {
  const match = window.location.pathname.match(/\/([^/]+)\/edit$/);
  return match?.[1] || null;
}

interface SimpleEmailCampaignSetupPageProps {
  mode?: "create" | "edit";
}

export default function SimpleEmailCampaignEditPage({ mode = "edit" }: SimpleEmailCampaignSetupPageProps = {}) {
  const [, paramsA] = useRoute("/campaigns/email/:id/edit");
  const [, paramsB] = useRoute("/simple-email-campaigns/:id/edit");
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const campaignId = paramsA?.id || paramsB?.id || getRouteCampaignId();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const seedClientAccountId = firstNonEmptyString(searchParams.get("clientId"));
  const seedProjectId = firstNonEmptyString(searchParams.get("projectId"), searchParams.get("clientProjectId"));
  const seedWorkOrderId = firstNonEmptyString(searchParams.get("workOrderId"), searchParams.get("orderId"));
  const isCreateMode = mode === "create" || !campaignId;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [orgAutofillLoading, setOrgAutofillLoading] = useState(false);

  const [jobTitleInput, setJobTitleInput] = useState("");
  const [industryInput, setIndustryInput] = useState("");
  const [showAutofillDialog, setShowAutofillDialog] = useState(false);
  const [autofillCandidates, setAutofillCandidates] = useState([]);
  const [autofillSelections, setAutofillSelections] = useState>({
    description: false,
    targetAudience: false,
    successCriteria: false,
    targetJobTitles: false,
    targetIndustries: false,
    landingPageUrl: false,
  });

  const [selectedAudienceSource, setSelectedAudienceSource] = useState("segment");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedSenderProfileId, setSelectedSenderProfileId] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [excludedContactIds, setExcludedContactIds] = useState([]);
  const [contactSelection, setContactSelection] = useState>({});
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [listPage, setListPage] = useState(1);
  const [selectedClientAccountId, setSelectedClientAccountId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [templateTone, setTemplateTone] = useState(DEFAULT_TEMPLATE_TONE);
  const [templateDesign, setTemplateDesign] = useState(DEFAULT_TEMPLATE_DESIGN);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templatePreheader, setTemplatePreheader] = useState("");
  const [templateBodyText, setTemplateBodyText] = useState("");
  const [templateBodyHtml, setTemplateBodyHtml] = useState("");
  const [templatePromptSource, setTemplatePromptSource] = useState("default fallback");
  const [templatePromptKey, setTemplatePromptKey] = useState(null);
  const [showTemplatePreviewModal, setShowTemplatePreviewModal] = useState(false);
  const initialPromptTemplateLoadedRef = useRef(false);
  const [testSendRows, setTestSendRows] = useState([]);
  const [isSendingTests, setIsSendingTests] = useState(false);
  const [testSendSummary, setTestSendSummary] = useState({
    lastAttemptAt: null,
    sentCount: 0,
    failedCount: 0,
  });

  const { data: campaign, isLoading: campaignLoading, error: campaignError } = useQuery({
    queryKey: ["admin-email-campaign", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/campaigns/${campaignId}`);
      return res.json();
    },
  });

  const { data: clientAccounts = [] } = useQuery({
    queryKey: ["admin-email-campaign-client-accounts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/clients");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: clientProjects = [], isLoading: clientProjectsLoading } = useQuery({
    queryKey: ["admin-email-campaign-client-projects", selectedClientAccountId],
    enabled: !!selectedClientAccountId,
    queryFn: async () => {
      if (!selectedClientAccountId) return [];
      const res = await apiRequest("GET", `/api/client-portal/admin/clients/${selectedClientAccountId}`);
      const body = await res.json();
      return Array.isArray(body?.projects) ? body.projects : [];
    },
    staleTime: 60_000,
  });

  const { data: senderProfiles = [], isLoading: senderProfilesLoading } = useQuery({
    queryKey: ["admin-email-campaign-sender-profiles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email-management/sender-profiles");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: adminOrders } = useQuery({
    queryKey: ["admin-email-campaign-orders"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/orders");
      return res.json();
    },
    staleTime: 60_000,
  });

  const relatedOrder = useMemo(() => {
    if (!adminOrders?.length) return null;
    if (selectedWorkOrderId) {
      return adminOrders.find((row) => row.order.id === selectedWorkOrderId)?.order || null;
    }

    const inferredProjectId = firstNonEmptyString(selectedProjectId, campaign?.projectId, seedProjectId);
    const inferredClientId = firstNonEmptyString(selectedClientAccountId, campaign?.clientAccountId, seedClientAccountId);
    const candidates = adminOrders.filter((row) => {
      if (campaign?.id && row.order.campaignId && row.order.campaignId === campaign.id) return true;
      if (inferredProjectId && row.order.projectId === inferredProjectId) return true;
      if (!inferredProjectId && inferredClientId && row.order.clientAccountId === inferredClientId) return true;
      return false;
    });
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      return new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime();
    })[0].order;
  }, [adminOrders, campaign?.id, campaign?.projectId, campaign?.clientAccountId, seedClientAccountId, seedProjectId, selectedClientAccountId, selectedProjectId, selectedWorkOrderId]);

  const filteredWorkOrders = useMemo(() => {
    if (!adminOrders?.length) return [];
    const orders = adminOrders.map((row) => row.order);
    return orders.filter((order) => {
      if (selectedClientAccountId && order.clientAccountId !== selectedClientAccountId) return false;
      if (selectedProjectId && order.projectId !== selectedProjectId) return false;
      return true;
    });
  }, [adminOrders, selectedClientAccountId, selectedProjectId]);

  const selectedWorkOrder = useMemo(() => {
    if (!selectedWorkOrderId || !adminOrders?.length) return null;
    const match = adminOrders.find((row) => row.order.id === selectedWorkOrderId);
    return match?.order || null;
  }, [adminOrders, selectedWorkOrderId]);

  const selectedProject = useMemo(
    () => clientProjects.find((project) => project.id === selectedProjectId) || null,
    [clientProjects, selectedProjectId]
  );

  const contextProjectId = firstNonEmptyString(
    selectedWorkOrder?.projectId,
    selectedProjectId,
    campaign?.projectId,
    seedProjectId
  ) || null;
  const contextClientAccountId = firstNonEmptyString(
    selectedClientAccountId,
    selectedWorkOrder?.clientAccountId,
    selectedProject?.clientAccountId,
    campaign?.clientAccountId,
    seedClientAccountId
  ) || null;

  const effectiveProjectId =
    contextProjectId;
  const effectiveOrgClientAccountId =
    contextClientAccountId;

  const { data: projectRequest } = useQuery({
    queryKey: ["admin-email-campaign-project", effectiveProjectId],
    enabled: !!effectiveProjectId,
    queryFn: async () => {
      if (!effectiveProjectId) return null;
      try {
        const res = await apiRequest("GET", `/api/admin/project-requests/${effectiveProjectId}`);
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: organizationIntelligence } = useQuery({
    queryKey: ["admin-email-campaign-org-intelligence", effectiveProjectId, effectiveOrgClientAccountId],
    enabled: !!effectiveProjectId || !!effectiveOrgClientAccountId,
    queryFn: async () => {
      if (effectiveProjectId) {
        try {
          const res = await apiRequest("GET", `/api/admin/project-requests/${effectiveProjectId}/organization-intelligence`);
          const body = await res.json();
          if (body?.organization) return body;
        } catch {
          // Fall through to client-account lookup.
        }
      }

      if (!effectiveOrgClientAccountId) return null;
      const fallbackRes = await apiRequest(
        "GET",
        `/api/admin/project-requests/by-client/${effectiveOrgClientAccountId}/organization-intelligence`
      );
      return fallbackRes.json();
    },
    staleTime: 120_000,
  });

  const selectedClientAccount = useMemo(
    () => clientAccounts.find((client) => client.id === selectedClientAccountId) || null,
    [clientAccounts, selectedClientAccountId]
  );

  const selectedSender = useMemo(
    () => senderProfiles.find((sender) => sender.id === selectedSenderProfileId) || null,
    [senderProfiles, selectedSenderProfileId]
  );

  const selectedOrgNameForBrand = firstNonEmptyString(
    selectedClientAccount?.name,
    selectedClientAccount?.companyName,
    relatedOrder?.title
  );
  const selectedOrgWebsiteForBrand = ensureAbsoluteUrl(
    firstNonEmptyString(
      organizationIntelligence?.organization?.identity?.website,
      organizationIntelligence?.organization?.identity?.websiteUrl,
      organizationIntelligence?.organization?.website,
      organizationIntelligence?.organization?.domain
    )
  );

  const { data: brandPaletteResponse } = useQuery({
    queryKey: [
      "admin-email-campaign-brand-palette",
      selectedClientAccountId,
      selectedOrgNameForBrand,
      selectedOrgWebsiteForBrand,
    ],
    enabled:
      !!selectedClientAccountId ||
      selectedOrgNameForBrand.toLowerCase().includes("argyle") ||
      selectedOrgWebsiteForBrand.includes("argyleforum.com"),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedClientAccountId) params.set("clientAccountId", selectedClientAccountId);
      if (selectedOrgNameForBrand) params.set("orgName", selectedOrgNameForBrand);
      if (selectedOrgWebsiteForBrand) params.set("website", selectedOrgWebsiteForBrand);
      try {
        const res = await apiRequest("GET", `/api/admin/brand-palette/resolve?${params.toString()}`);
        return res.json();
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60_000,
  });

  const argylePaletteOverrides = useMemo(() => {
    const serverPalette =
      brandPaletteResponse?.palette?.key === "argyle"
        ? brandPaletteResponse.palette.overrides
        : brandPaletteResponse?.fallback?.key === "argyle"
          ? brandPaletteResponse.fallback.overrides
          : null;
    return serverPalette || DEFAULT_ARGYLE_BRAND_OVERRIDES;
  }, [brandPaletteResponse]);

  const { data: segments = [] } = useQuery({
    queryKey: ["admin-email-campaign-segments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/segments");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["admin-email-campaign-lists"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lists");
      return res.json();
    },
    staleTime: 60_000,
  });

  const contactLists = useMemo(
    () => lists.filter((list) => list.entityType === "contact"),
    [lists]
  );

  const contactSegments = useMemo(
    () => segments.filter((segment) => !segment.entityType || segment.entityType === "contact"),
    [segments]
  );

  const selectedSegment = useMemo(
    () => contactSegments.find((segment) => segment.id === selectedSegmentId) || null,
    [contactSegments, selectedSegmentId]
  );

  const selectedList = useMemo(
    () => contactLists.find((list) => list.id === selectedListId) || null,
    [contactLists, selectedListId]
  );

  const persistedAudienceConfig = useMemo(() => {
    const refs = (campaign?.audienceRefs || {}) as any;
    const wizardAudience = refs?.wizardDetails?.adminEmailAudience as PersistedAdminAudienceConfig | undefined;
    if (wizardAudience) return wizardAudience;

    const segmentId = Array.isArray(refs?.segments) ? refs.segments[0] : null;
    const listId = Array.isArray(refs?.lists) ? refs.lists[0] : null;
    if (!segmentId && !listId) return null;

    return {
      source: segmentId ? "segment" : "list",
      segmentId,
      listId,
      excludedContactIds: normalizeTextArray(refs?.wizardDetails?.excludedContactIds),
    };
  }, [campaign?.audienceRefs]);

  const persistedTemplateConfig = useMemo(() => {
    const refs = (campaign?.audienceRefs || {}) as any;
    const wizardTemplate = refs?.wizardDetails?.adminEmailTemplate as PersistedAdminEmailTemplateConfig | undefined;
    if (!wizardTemplate) return null;
    return {
      tone: wizardTemplate.tone,
      design: wizardTemplate.design,
      subject: firstNonEmptyString(wizardTemplate.subject),
      preheader: firstNonEmptyString(wizardTemplate.preheader),
      bodyText: firstNonEmptyString(wizardTemplate.bodyText),
      bodyHtml: firstNonEmptyString(wizardTemplate.bodyHtml),
      promptSource: firstNonEmptyString(wizardTemplate.promptSource),
      promptKey: firstNonEmptyString(wizardTemplate.promptKey),
      personalizationTokens: normalizeTextArray(wizardTemplate.personalizationTokens),
    };
  }, [campaign?.audienceRefs]);

  const persistedTestSendConfig = useMemo(() => {
    const refs = (campaign?.audienceRefs || {}) as any;
    const wizardTestSend = refs?.wizardDetails?.adminEmailTestSend as PersistedAdminEmailTestSendConfig | undefined;
    if (!wizardTestSend) return null;
    return {
      rows: Array.isArray(wizardTestSend.rows) ? wizardTestSend.rows : [],
      lastAttemptAt: typeof wizardTestSend.lastAttemptAt === "string" ? wizardTestSend.lastAttemptAt : null,
      sentCount: typeof wizardTestSend.sentCount === "number" ? wizardTestSend.sentCount : 0,
      failedCount: typeof wizardTestSend.failedCount === "number" ? wizardTestSend.failedCount : 0,
    };
  }, [campaign?.audienceRefs]);

  const {
    data: listMembersData,
    isLoading: listMembersLoading,
  } = useQuery({
    queryKey: ["admin-email-campaign-list-members", selectedListId],
    enabled: step >= 3 && selectedAudienceSource === "list" && !!selectedListId,
    queryFn: async () => {
      if (!selectedListId) return [];
      const res = await apiRequest("GET", `/api/lists/${selectedListId}/members`);
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    },
    staleTime: 30_000,
  });
  const listMembers = listMembersData ?? EMPTY_LIST_MEMBERS;

  const clientSnapshot = useMemo(() => {
    const wizardDetails = (campaign?.audienceRefs as any)?.wizardDetails || {};
    const targetTitlesFromOrder = normalizeTextArray(relatedOrder?.targetTitles);
    const targetIndustriesFromOrder = normalizeTextArray(relatedOrder?.targetIndustries);
    const campaignConfig = (relatedOrder?.campaignConfig || {}) as any;
    const audienceFallbackParts: string[] = [];
    if (targetTitlesFromOrder.length > 0) {
      audienceFallbackParts.push(`titles: ${targetTitlesFromOrder.slice(0, 6).join(", ")}`);
    }
    if (targetIndustriesFromOrder.length > 0) {
      audienceFallbackParts.push(`industries: ${targetIndustriesFromOrder.slice(0, 6).join(", ")}`);
    }
    const orderAudienceFallback = audienceFallbackParts.join(" | ");
    const requestedLeadGoal =
      typeof projectRequest?.requestedLeadCount === "number" && projectRequest.requestedLeadCount > 0
        ? `Generate ${projectRequest.requestedLeadCount} qualified leads.`
        : "";

    return {
      name:
        campaign?.name ||
        firstNonEmptyString(projectRequest?.name, selectedProject?.name, relatedOrder?.title),
      objective:
        campaign?.campaignObjective ||
        firstNonEmptyString(
          campaignConfig.objective,
          projectRequest?.description,
          selectedProject?.description,
          relatedOrder?.description
        ) ||
        "",
      description:
        campaign?.productServiceInfo ||
        firstNonEmptyString(
          relatedOrder?.description,
          selectedProject?.description,
          projectRequest?.description,
          relatedOrder?.title
        ) ||
        "",
      targetAudience:
        campaign?.targetAudienceDescription ||
        firstNonEmptyString(
          campaignConfig.targetAudience,
          campaignConfig.audienceDescription,
          campaignConfig.audience,
          orderAudienceFallback
        ) ||
        "",
      successCriteria:
        campaign?.successCriteria ||
        firstNonEmptyString(
          campaignConfig.successCriteria,
          campaignConfig.goal,
          campaignConfig.primaryKpi,
          requestedLeadGoal
        ) ||
        "",
      targetJobTitles:
        normalizeTextArray(wizardDetails.targetJobTitles).length > 0
          ? normalizeTextArray(wizardDetails.targetJobTitles)
          : targetTitlesFromOrder,
      targetIndustries:
        normalizeTextArray(wizardDetails.targetIndustries).length > 0
          ? normalizeTextArray(wizardDetails.targetIndustries)
          : targetIndustriesFromOrder,
      landingPageUrl:
        campaign?.landingPageUrl ||
        projectRequest?.landingPageUrl ||
        campaignConfig.landingPageUrl ||
        "",
    };
  }, [campaign, projectRequest, relatedOrder, selectedProject]);

  useEffect(() => {
    if (initialized) return;
    if (!isCreateMode && !campaign) return;

    const normalizedType = campaign?.type === "combo" ? "combo" : "email";

    setForm({
      channel: normalizedType,
      name: clientSnapshot.name,
      objective: clientSnapshot.objective,
      description: clientSnapshot.description,
      targetAudience: clientSnapshot.targetAudience,
      successCriteria: clientSnapshot.successCriteria,
      targetJobTitles: clientSnapshot.targetJobTitles,
      targetIndustries: clientSnapshot.targetIndustries,
      landingPageUrl: clientSnapshot.landingPageUrl,
    });
    const inferredClientAccountId = firstNonEmptyString(
      campaign?.clientAccountId,
      seedClientAccountId,
      relatedOrder?.clientAccountId
    );
    const inferredProjectId = firstNonEmptyString(
      campaign?.projectId,
      seedProjectId,
      relatedOrder?.projectId
    );
    const inferredWorkOrderId = firstNonEmptyString(seedWorkOrderId, relatedOrder?.id);
    setSelectedClientAccountId(inferredClientAccountId);
    setSelectedProjectId(inferredProjectId);
    setSelectedWorkOrderId(inferredWorkOrderId);

    const inferredAudienceSource: AudienceSource =
      persistedAudienceConfig?.source === "list" || persistedAudienceConfig?.source === "segment"
        ? persistedAudienceConfig.source
        : Array.isArray((campaign?.audienceRefs as any)?.segments) && (campaign?.audienceRefs as any).segments.length > 0
          ? "segment"
          : "list";

    const inferredSegmentId =
      firstNonEmptyString(
        persistedAudienceConfig?.segmentId,
        Array.isArray((campaign?.audienceRefs as any)?.segments) ? (campaign?.audienceRefs as any).segments[0] : ""
      ) || "";
    const inferredListId =
      firstNonEmptyString(
        persistedAudienceConfig?.listId,
        Array.isArray((campaign?.audienceRefs as any)?.lists) ? (campaign?.audienceRefs as any).lists[0] : ""
      ) || "";

    setSelectedAudienceSource(inferredAudienceSource);
    setSelectedSegmentId(inferredSegmentId);
    setSelectedListId(inferredListId);
    setSelectedSenderProfileId(firstNonEmptyString(campaign?.senderProfileId));
    setReplyToEmail(firstNonEmptyString(campaign?.replyToEmail));
    setExcludedContactIds(normalizeTextArray(persistedAudienceConfig?.excludedContactIds));
    setContactSelection({});
    setListSearchQuery("");
    setListPage(1);

    const initialTone =
      persistedTemplateConfig?.tone === "friendly" || persistedTemplateConfig?.tone === "direct" || persistedTemplateConfig?.tone === "professional"
        ? persistedTemplateConfig.tone
        : DEFAULT_TEMPLATE_TONE;
    const initialDesign =
      persistedTemplateConfig?.design === "plain" ||
      persistedTemplateConfig?.design === "branded" ||
      persistedTemplateConfig?.design === "newsletter" ||
      persistedTemplateConfig?.design === "argyle-brand"
        ? persistedTemplateConfig.design
        : DEFAULT_TEMPLATE_DESIGN;
    const generatedTemplate = generateTemplateVariant({
      tone: initialTone,
      design: initialDesign,
      campaignName: clientSnapshot.name,
      objective: clientSnapshot.objective,
      description: clientSnapshot.description,
      landingPageUrl: clientSnapshot.landingPageUrl,
      targetAudience: clientSnapshot.targetAudience,
      orgName:
        clientAccounts.find((client) => client.id === inferredClientAccountId)?.name ||
        selectedProject?.name ||
        relatedOrder?.title ||
        "Your Organization",
      paletteOverrides: initialDesign === "argyle-brand" ? argylePaletteOverrides : undefined,
    });
    setTemplateTone(initialTone);
    setTemplateDesign(initialDesign);
    setTemplateSubject(firstNonEmptyString(persistedTemplateConfig?.subject, generatedTemplate.subject));
    setTemplatePreheader(firstNonEmptyString(persistedTemplateConfig?.preheader, generatedTemplate.preheader));
    setTemplateBodyText(firstNonEmptyString(persistedTemplateConfig?.bodyText, generatedTemplate.bodyText));
    setTemplateBodyHtml(firstNonEmptyString(persistedTemplateConfig?.bodyHtml, generatedTemplate.bodyHtml));
    setTemplatePromptSource(firstNonEmptyString(persistedTemplateConfig?.promptSource, "default fallback"));
    setTemplatePromptKey(firstNonEmptyString(persistedTemplateConfig?.promptKey) || null);
    const persistedRows = Array.isArray(persistedTestSendConfig?.rows)
      ? persistedTestSendConfig.rows
          .map((row) =>
            createTestSendRow({
              first_name: firstNonEmptyString(row?.first_name),
              last_name: firstNonEmptyString(row?.last_name),
              email: firstNonEmptyString(row?.email),
              company: firstNonEmptyString(
                row?.company,
                clientAccounts.find((client) => client.id === inferredClientAccountId)?.name
              ),
              job_title: firstNonEmptyString(row?.job_title),
            })
          )
          .filter((row) => row.email || row.first_name || row.last_name || row.company || row.job_title)
      : [];
    setTestSendRows(
      persistedRows.length > 0
        ? persistedRows
        : [
            createTestSendRow({
              first_name: "Alex",
              last_name: "Taylor",
              email: "",
              company: firstNonEmptyString(
                clientAccounts.find((client) => client.id === inferredClientAccountId)?.name,
                "Acme"
              ),
              job_title: "Director",
            }),
          ]
    );
    setTestSendSummary({
      lastAttemptAt: persistedTestSendConfig?.lastAttemptAt || null,
      sentCount: Number(persistedTestSendConfig?.sentCount || 0),
      failedCount: Number(persistedTestSendConfig?.failedCount || 0),
    });
    setInitialized(true);
  }, [
    isCreateMode,
    campaign,
    initialized,
    clientSnapshot,
    relatedOrder,
    persistedAudienceConfig,
    persistedTemplateConfig,
    persistedTestSendConfig,
    clientAccounts,
    argylePaletteOverrides,
    seedClientAccountId,
    seedProjectId,
    seedWorkOrderId,
    selectedProject,
  ]);

  useEffect(() => {
    if (!senderProfiles.length) return;
    if (selectedSenderProfileId && senderProfiles.some((sender) => sender.id === selectedSenderProfileId)) return;

    const preferredSender =
      senderProfiles.find((sender) => sender.id === campaign?.senderProfileId) ||
      senderProfiles.find((sender) => sender.isDefault) ||
      senderProfiles[0] ||
      null;

    if (!preferredSender) return;

    setSelectedSenderProfileId(preferredSender.id);
    setReplyToEmail((current) =>
      current.trim() || preferredSender.replyToEmail || preferredSender.replyTo || preferredSender.fromEmail || ""
    );
  }, [campaign?.senderProfileId, selectedSenderProfileId, senderProfiles]);

  useEffect(() => {
    if (!selectedClientAccountId) {
      setSelectedProjectId("");
      return;
    }
    if (!clientProjects.some((project) => project.id === selectedProjectId)) {
      const fallbackProjectId = firstNonEmptyString(seedProjectId, campaign?.projectId, relatedOrder?.projectId, clientProjects[0]?.id);
      setSelectedProjectId(fallbackProjectId);
    }
  }, [campaign?.projectId, clientProjects, relatedOrder?.projectId, seedProjectId, selectedClientAccountId, selectedProjectId]);

  useEffect(() => {
    if (!selectedWorkOrderId || filteredWorkOrders.some((order) => order.id === selectedWorkOrderId)) return;
    setSelectedWorkOrderId("");
  }, [filteredWorkOrders, selectedWorkOrderId]);

  useEffect(() => {
    if (!initialized) return;

    setForm((prev) => {
      const next = { ...prev };
      let changed = false;

      if (!next.name.trim() && clientSnapshot.name) {
        next.name = clientSnapshot.name;
        changed = true;
      }
      if (!next.objective.trim() && clientSnapshot.objective) {
        next.objective = clientSnapshot.objective;
        changed = true;
      }
      if (!next.description.trim() && clientSnapshot.description) {
        next.description = clientSnapshot.description;
        changed = true;
      }
      if (!next.targetAudience.trim() && clientSnapshot.targetAudience) {
        next.targetAudience = clientSnapshot.targetAudience;
        changed = true;
      }
      if (!next.successCriteria.trim() && clientSnapshot.successCriteria) {
        next.successCriteria = clientSnapshot.successCriteria;
        changed = true;
      }
      if (next.targetJobTitles.length === 0 && clientSnapshot.targetJobTitles.length > 0) {
        next.targetJobTitles = clientSnapshot.targetJobTitles;
        changed = true;
      }
      if (next.targetIndustries.length === 0 && clientSnapshot.targetIndustries.length > 0) {
        next.targetIndustries = clientSnapshot.targetIndustries;
        changed = true;
      }
      if (!next.landingPageUrl.trim() && clientSnapshot.landingPageUrl) {
        next.landingPageUrl = clientSnapshot.landingPageUrl;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [clientSnapshot, initialized]);

  const listMemberIds = useMemo(
    () => listMembers.map((member) => member.id).filter((id): id is string => typeof id === "string" && id.length > 0),
    [listMembers]
  );

  const listMemberIdSet = useMemo(() => new Set(listMemberIds), [listMemberIds]);
  const excludedContactIdSet = useMemo(() => new Set(excludedContactIds), [excludedContactIds]);

  const staticListExcludedCount = useMemo(
    () => excludedContactIds.filter((contactId) => listMemberIdSet.has(contactId)).length,
    [excludedContactIds, listMemberIdSet]
  );

  const staticListTotalCount = listMembers.length;
  const staticListIncludedCount = Math.max(staticListTotalCount - staticListExcludedCount, 0);

  const normalizedSearch = listSearchQuery.trim().toLowerCase();
  const filteredListMembers = useMemo(() => {
    if (!normalizedSearch) return listMembers;
    return listMembers.filter((member) => {
      const name = `${member.fullName || ""} ${member.firstName || ""} ${member.lastName || ""}`.trim().toLowerCase();
      const email = (member.email || "").toLowerCase();
      const company = (member.accountName || member.account?.name || "").toLowerCase();
      const title = (member.jobTitle || "").toLowerCase();
      return name.includes(normalizedSearch) || email.includes(normalizedSearch) || company.includes(normalizedSearch) || title.includes(normalizedSearch);
    });
  }, [listMembers, normalizedSearch]);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredListMembers.length / pageSize));
  const activePage = Math.min(listPage, totalPages);
  const pagedListMembers = useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return filteredListMembers.slice(start, start + pageSize);
  }, [filteredListMembers, activePage]);

  const selectedContactIds = useMemo(
    () => Object.entries(contactSelection).filter(([, selected]) => selected).map(([contactId]) => contactId),
    [contactSelection]
  );

  const selectedCount = selectedContactIds.length;
  const pageContactIds = useMemo(
    () => pagedListMembers.map((member) => member.id).filter((id): id is string => typeof id === "string" && id.length > 0),
    [pagedListMembers]
  );
  const allPageSelected = pageContactIds.length > 0 && pageContactIds.every((id) => !!contactSelection[id]);
  const allFilteredSelected =
    filteredListMembers.length > 0 &&
    filteredListMembers.every((member) => (member.id ? !!contactSelection[member.id] : false));
  const segmentAudienceCount = Number(selectedSegment?.recordCountCache || 0);

  const firstIncludedListMember = useMemo(() => {
    if (selectedAudienceSource !== "list") return null;
    return listMembers.find((member) => member.id && !excludedContactIdSet.has(member.id)) || null;
  }, [selectedAudienceSource, listMembers, excludedContactIdSet]);

  const templateSampleContact = useMemo(() => {
    if (firstIncludedListMember?.id) {
      const fallbackName = firstNonEmptyString(firstIncludedListMember.fullName, firstIncludedListMember.email?.split("@")[0], "Alex Taylor");
      const fallbackParts = fallbackName.split(" ");
      const firstName = firstNonEmptyString(firstIncludedListMember.firstName, fallbackParts[0], "Alex");
      const lastName = firstNonEmptyString(firstIncludedListMember.lastName, fallbackParts.slice(1).join(" "), "Taylor");
      return {
        id: firstIncludedListMember.id,
        firstName,
        lastName,
        company: firstNonEmptyString(firstIncludedListMember.accountName, firstIncludedListMember.account?.name, selectedClientAccount?.name, "Acme"),
        email: firstNonEmptyString(firstIncludedListMember.email, "alex.taylor@example.com"),
        jobTitle: firstNonEmptyString(firstIncludedListMember.jobTitle, "Director"),
      };
    }

    return {
      id: "sample-contact",
      firstName: "Alex",
      lastName: "Taylor",
      company: firstNonEmptyString(selectedClientAccount?.name, "Acme"),
      email: "alex.taylor@example.com",
      jobTitle: "Director",
    };
  }, [firstIncludedListMember, selectedClientAccount]);

  const templateOrganizationName = firstNonEmptyString(
    selectedClientAccount?.name,
    selectedClientAccount?.companyName,
    "Your Organization"
  );

  const templateRenderedSubject = useMemo(
    () => replaceTemplateTokens(templateSubject || "", templateSampleContact),
    [templateSubject, templateSampleContact]
  );
  const templateRenderedPreheader = useMemo(
    () => replaceTemplateTokens(templatePreheader || "", templateSampleContact),
    [templatePreheader, templateSampleContact]
  );

  const templateRenderedBodyText = useMemo(
    () => replaceTemplateTokens(templateBodyText || "", templateSampleContact),
    [templateBodyText, templateSampleContact]
  );

  const templateRenderedHtml = useMemo(() => {
    const html = (templateBodyHtml || "").trim();
    if (!html) return "";
    return replaceTemplateTokens(html, templateSampleContact);
  }, [templateBodyHtml, templateSampleContact]);
  const landingPageUrlForTemplate = ensureAbsoluteUrl(form.landingPageUrl);
  const hasLandingPageUrl = !!landingPageUrlForTemplate;
  const templateRenderedHtmlWithTargets = useMemo(
    () => withExternalAnchorTargets(templateRenderedHtml || bodyTextToHtml(templateRenderedBodyText)),
    [templateRenderedHtml, templateRenderedBodyText]
  );

  const previewContacts = useMemo(
    () => [
      {
        id: templateSampleContact.id,
        firstName: templateSampleContact.firstName,
        lastName: templateSampleContact.lastName,
        company: templateSampleContact.company,
        email: templateSampleContact.email,
      },
    ],
    [templateSampleContact]
  );

  const testSendStatusCounts = useMemo(() => {
    const sent = testSendRows.filter((row) => row.status === "sent").length;
    const failed = testSendRows.filter((row) => row.status === "failed").length;
    const invalid = testSendRows.filter((row) => row.status === "invalid").length;
    return { sent, failed, invalid, total: testSendRows.length };
  }, [testSendRows]);

  const audienceReady =
    selectedAudienceSource === "segment"
      ? !!selectedSegmentId
      : !!selectedListId && staticListIncludedCount > 0;
  const templateReady = templateSubject.trim().length > 0 && templateBodyText.trim().length > 0;
  const emailRoutingReady = !!selectedSenderProfileId && isValidEmail(replyToEmail);

  const canProceed = useMemo(() => {
    if (step === 0) return !!form.channel;
    if (step === 1) {
      return (
        form.name.trim().length > 0 &&
        form.objective.trim().length > 0 &&
        emailRoutingReady &&
        !!selectedClientAccountId
      );
    }
    if (step === 2) return true;
    if (step === 3) return audienceReady;
    if (step === 4) return templateReady;
    return true;
  }, [step, form, audienceReady, emailRoutingReady, selectedClientAccountId, templateReady]);

  useEffect(() => {
    if (selectedSegmentId && !contactSegments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId("");
    }
  }, [contactSegments, selectedSegmentId]);

  useEffect(() => {
    if (selectedListId && !contactLists.some((list) => list.id === selectedListId)) {
      setSelectedListId("");
    }
  }, [contactLists, selectedListId]);

  useEffect(() => {
    setListPage(1);
    setContactSelection({});
  }, [selectedListId, listSearchQuery]);

  useEffect(() => {
    if (selectedAudienceSource !== "list") return;
    setExcludedContactIds((prev) => {
      const next = prev.filter((contactId) => listMemberIdSet.has(contactId));
      if (next.length === prev.length && next.every((contactId, idx) => contactId === prev[idx])) {
        return prev;
      }
      return next;
    });
    setContactSelection((prev) => {
      const next: Record = {};
      for (const [contactId, selected] of Object.entries(prev)) {
        if (selected && listMemberIdSet.has(contactId)) next[contactId] = true;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((key) => !!prev[key] === !!next[key])) {
        return prev;
      }
      return next;
    });
  }, [selectedAudienceSource, listMemberIdSet]);

  const getPaletteOverridesForDesign = (design: TemplateDesign): BrandPaletteOverrides | undefined =>
    design === "argyle-brand" ? argylePaletteOverrides : undefined;

  const inferredPromptCampaignType = useMemo(() => {
    if (projectRequest?.externalEventId) return "argyle_event";
    const orderType =
      typeof relatedOrder?.campaignConfig?.campaignType === "string"
        ? relatedOrder.campaignConfig.campaignType
        : "";
    return firstNonEmptyString(orderType, campaign?.type, "default");
  }, [campaign?.type, projectRequest?.externalEventId, relatedOrder?.campaignConfig]);

  const applyGeneratedTemplate = async (
    nextTone: TemplateTone,
    nextDesign: TemplateDesign,
    options?: { silent?: boolean }
  ) => {
    const cacheBust = Date.now();
    const generationUrl = "/api/admin/email-campaign-templates/generate";
    const fallbackGenerated = generateTemplateVariant({
      tone: nextTone,
      design: nextDesign,
      campaignName: form.name,
      objective: form.objective,
      description: form.description,
      landingPageUrl: form.landingPageUrl,
      targetAudience: form.targetAudience,
      orgName: templateOrganizationName,
      paletteOverrides: getPaletteOverridesForDesign(nextDesign),
    });

    try {
      console.info("[EmailTemplateDebug] client.request", {
        method: "POST",
        url: generationUrl,
        campaignId,
        tone: nextTone,
        design: nextDesign,
        cacheBust,
      });

      const response = await apiRequest("POST", generationUrl, {
        campaignId,
        projectId: campaign?.projectId || undefined,
        clientAccountId: selectedClientAccountId || campaign?.clientAccountId || undefined,
        campaignType: inferredPromptCampaignType,
        channel: form.channel,
        tone: nextTone,
        design: nextDesign,
        campaignName: form.name,
        objective: form.objective,
        description: form.description,
        targetAudience: form.targetAudience,
        successCriteria: form.successCriteria,
        targetJobTitles: form.targetJobTitles,
        targetIndustries: form.targetIndustries,
        landingPageUrl: form.landingPageUrl,
        organizationName: templateOrganizationName,
        organizationIntelligence: (organizationIntelligence?.organization as any) || undefined,
        eventContext: projectRequest
          ? {
              title: firstNonEmptyString((projectRequest as any)?.eventTitle, form.name),
              date: firstNonEmptyString((projectRequest as any)?.eventDate),
              type: firstNonEmptyString((projectRequest as any)?.eventType),
              location: firstNonEmptyString((projectRequest as any)?.eventLocation),
              community: firstNonEmptyString((projectRequest as any)?.eventCommunity),
              sourceUrl: firstNonEmptyString((projectRequest as any)?.eventSourceUrl, form.landingPageUrl),
              overview: firstNonEmptyString((projectRequest as any)?.description, form.description),
            }
          : undefined,
        recipient: {
          firstName: templateSampleContact.firstName,
          company: templateSampleContact.company,
          jobTitle: templateSampleContact.jobTitle,
          industry: firstNonEmptyString(form.targetIndustries[0]),
        },
        paletteOverrides: getPaletteOverridesForDesign(nextDesign),
        cacheBust,
        forceRefreshEventBrief: true,
      });
      const responseContentType = (response.headers.get("content-type") || "").toLowerCase();
      console.info("[EmailTemplateDebug] client.response.meta", {
        url: generationUrl,
        status: response.status,
        contentType: responseContentType,
      });
      if (!responseContentType.includes("application/json")) {
        const rawBody = await response.text();
        const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 120);
        throw new Error(
          `Template generation returned non-JSON content (${responseContentType || "unknown"}).${preview ? ` ${preview}` : ""}`
        );
      }

      let body: GeneratedAdminEmailTemplateResponse;
      try {
        body = (await response.json()) as GeneratedAdminEmailTemplateResponse;
      } catch {
        throw new Error("Template generation returned invalid JSON response");
      }
      const generated = body?.template;

      if (!generated) {
        throw new Error("Template generator returned an empty response");
      }

      console.info("[EmailTemplateDebug] client.response.template", {
        subjectLength: firstNonEmptyString(generated.subject).length,
        preheaderLength: firstNonEmptyString(generated.preheader).length,
        bodyLength: firstNonEmptyString(generated.bodyText).length,
        promptSource: firstNonEmptyString(generated.promptSource),
        promptKey: firstNonEmptyString(generated.promptKeyUsed),
      });

      setTemplateTone(nextTone);
      setTemplateDesign(nextDesign);
      setTemplateSubject(firstNonEmptyString(generated.subject, fallbackGenerated.subject));
      setTemplatePreheader(firstNonEmptyString(generated.preheader, fallbackGenerated.preheader));
      setTemplateBodyText(firstNonEmptyString(generated.bodyText, fallbackGenerated.bodyText));
      setTemplateBodyHtml(firstNonEmptyString(generated.bodyHtml, fallbackGenerated.bodyHtml));
      setTemplatePromptSource(firstNonEmptyString(generated.promptSource, "default fallback"));
      setTemplatePromptKey(firstNonEmptyString(generated.promptKeyUsed) || null);
    } catch (error: any) {
      setTemplateTone(nextTone);
      setTemplateDesign(nextDesign);
      setTemplateSubject(fallbackGenerated.subject);
      setTemplatePreheader(fallbackGenerated.preheader);
      setTemplateBodyText(fallbackGenerated.bodyText);
      setTemplateBodyHtml(fallbackGenerated.bodyHtml);
      setTemplatePromptSource("default fallback");
      setTemplatePromptKey(null);

      console.info("[EmailTemplateDebug] client.fallback-used", {
        reason: String(error?.message || "unknown"),
      });

      if (!options?.silent) {
        const rawMessage = String(error?.message || "");
        const userMessage = rawMessage.includes("non-JSON content")
          ? "Server returned HTML instead of JSON. Please refresh and retry; if it persists, restart the backend server."
          : rawMessage || "Used fallback template rules.";
        toast({
          title: "Prompt generation unavailable",
          description: userMessage,
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => {
    if (!initialized || initialPromptTemplateLoadedRef.current) return;

    const hasPersistedTemplate =
      !!persistedTemplateConfig?.subject &&
      !!persistedTemplateConfig?.bodyText;
    initialPromptTemplateLoadedRef.current = true;
    if (hasPersistedTemplate) return;

    void applyGeneratedTemplate(templateTone, templateDesign, { silent: true });
  }, [
    initialized,
    persistedTemplateConfig?.subject,
    persistedTemplateConfig?.bodyText,
    templateTone,
    templateDesign,
  ]);

  useEffect(() => {
    if (!initialized) return;
    const nextHtml = buildTemplateHtmlFromInputs({
      tone: templateTone,
      design: templateDesign,
      subject: templateSubject,
      bodyText: templateBodyText,
      objective: form.objective,
      targetAudience: form.targetAudience,
      landingPageUrl: form.landingPageUrl,
      orgName: templateOrganizationName,
      paletteOverrides: getPaletteOverridesForDesign(templateDesign),
    });
    setTemplateBodyHtml(nextHtml);
  }, [
    initialized,
    templateTone,
    templateDesign,
    templateSubject,
    templateBodyText,
    form.objective,
    form.targetAudience,
    form.landingPageUrl,
    templateOrganizationName,
    argylePaletteOverrides,
  ]);

  const addArrayItem = (field: "targetJobTitles" | "targetIndustries", value: string, clear: () => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setForm((prev) => {
      if (prev[field].includes(trimmed)) return prev;
      return { ...prev, [field]: [...prev[field], trimmed] };
    });
    clear();
  };

  const removeArrayItem = (field: "targetJobTitles" | "targetIndustries", value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].filter((item) => item !== value),
    }));
  };

  const buildOrgIntelligenceSuggestions = (): Partial> => {
    const org = organizationIntelligence?.organization;
    if (!org) return {};

    const icpIndustries = normalizeLooseArray(org?.icp?.industries);
    const personaTitles = normalizeLooseArray(org?.icp?.personas);
    const fallbackIndustry = firstNonEmptyString(org?.identity?.industry, org?.industry);
    const websiteUrl = ensureAbsoluteUrl(
      firstNonEmptyString(org?.identity?.website, org?.identity?.websiteUrl, org?.website, org?.domain)
    );

    const descriptionParts = [
      firstNonEmptyString(org?.identity?.description),
      firstNonEmptyString(org?.positioning?.valueProposition),
      normalizeLooseArray(org?.offerings?.coreProducts).slice(0, 3).join(", "),
    ]
      .filter(Boolean)
      .join(" ");

    const audienceParts: string[] = [];
    const companySize = firstNonEmptyString(org?.icp?.companySize);
    if (companySize) audienceParts.push(`${companySize} companies`);
    if (personaTitles.length > 0) audienceParts.push(`buyers: ${personaTitles.slice(0, 4).join(", ")}`);
    if (icpIndustries.length > 0) audienceParts.push(`industries: ${icpIndustries.slice(0, 4).join(", ")}`);

    const useCases = normalizeLooseArray(org?.offerings?.useCases);
    const successCriteria = useCases.length > 0 ? `Generate qualified opportunities for ${useCases.slice(0, 2).join(" and ")}.` : "";

    return {
      description: descriptionParts.trim(),
      targetAudience: audienceParts.join(" | ").trim(),
      successCriteria,
      targetJobTitles: personaTitles,
      targetIndustries: icpIndustries.length > 0 ? icpIndustries : fallbackIndustry ? [fallbackIndustry] : [],
      landingPageUrl: websiteUrl,
    };
  };

  const areStringArraysEqual = (a: string[], b: string[]) => {
    const sortedA = [...new Set(a.map((item) => item.trim()).filter(Boolean))].sort();
    const sortedB = [...new Set(b.map((item) => item.trim()).filter(Boolean))].sort();
    if (sortedA.length !== sortedB.length) return false;
    return sortedA.every((item, idx) => item === sortedB[idx]);
  };

  const runOrgAutofill = () => {
    if (!organizationIntelligence?.organization) {
      toast({
        title: "No organization intelligence found",
        description: "Select a valid organization/work order with an organization profile, then retry.",
        variant: "destructive",
      });
      return;
    }

    setOrgAutofillLoading(true);
    try {
      const suggestions = buildOrgIntelligenceSuggestions();
      const candidateFields: Array = [
        { key: "description", label: "Additional Description" },
        { key: "targetAudience", label: "Target Audience" },
        { key: "successCriteria", label: "Success Criteria" },
        { key: "targetJobTitles", label: "Target Job Titles" },
        { key: "targetIndustries", label: "Target Industries" },
        { key: "landingPageUrl", label: "Landing Page URL" },
      ];

      const emptyUpdates: Partial = {};
      const replacements: AutofillCandidate[] = [];

      for (const field of candidateFields) {
        const suggested = suggestions[field.key];
        if (Array.isArray(suggested)) {
          const cleanSuggested = normalizeTextArray(suggested);
          if (cleanSuggested.length === 0) continue;
          const current = field.key === "targetJobTitles" ? form.targetJobTitles : form.targetIndustries;
          if (current.length === 0) {
            emptyUpdates[field.key] = cleanSuggested as any;
          } else if (!areStringArraysEqual(current, cleanSuggested)) {
            replacements.push({
              key: field.key,
              label: field.label,
              currentValue: current,
              suggestedValue: cleanSuggested,
            });
          }
          continue;
        }

        if (typeof suggested === "string" && suggested.trim()) {
          const current = (form[field.key] as string).trim();
          if (!current) {
            emptyUpdates[field.key] = suggested.trim() as any;
          } else if (current !== suggested.trim()) {
            replacements.push({
              key: field.key,
              label: field.label,
              currentValue: form[field.key] as string,
              suggestedValue: suggested.trim(),
            });
          }
        }
      }

      const hasEmptyUpdates = Object.keys(emptyUpdates).length > 0;
      if (hasEmptyUpdates) {
        setForm((prev) => ({ ...prev, ...emptyUpdates }));
      }

      if (replacements.length > 0) {
        setAutofillCandidates(replacements);
        setAutofillSelections({
          description: false,
          targetAudience: false,
          successCriteria: false,
          targetJobTitles: false,
          targetIndustries: false,
          landingPageUrl: false,
        });
        setShowAutofillDialog(true);
      }

      if (!hasEmptyUpdates && replacements.length === 0) {
        toast({
          title: "No new suggestions available",
          description: "Organization intelligence does not have additional values to apply.",
        });
      } else if (hasEmptyUpdates && replacements.length > 0) {
        toast({
          title: "Auto-fill applied",
          description: `Filled ${Object.keys(emptyUpdates).length} empty field(s). Review optional replacements.`,
        });
      } else if (hasEmptyUpdates) {
        toast({
          title: "Auto-fill applied",
          description: `Filled ${Object.keys(emptyUpdates).length} empty field(s) from organization intelligence.`,
        });
      } else {
        toast({
          title: "Suggestions ready",
          description: "Review replacements before applying over client-submitted values.",
        });
      }
    } finally {
      setOrgAutofillLoading(false);
    }
  };

  const applySelectedAutofillReplacements = () => {
    const selected = autofillCandidates.filter((candidate) => autofillSelections[candidate.key]);
    if (selected.length === 0) {
      setShowAutofillDialog(false);
      return;
    }

    setForm((prev) => {
      const next = { ...prev };
      for (const candidate of selected) {
        if (candidate.key === "targetJobTitles" || candidate.key === "targetIndustries") {
          (next as any)[candidate.key] = Array.isArray(candidate.suggestedValue)
            ? normalizeTextArray(candidate.suggestedValue)
            : [];
        } else {
          (next as any)[candidate.key] = typeof candidate.suggestedValue === "string" ? candidate.suggestedValue : "";
        }
      }
      return next;
    });

    setShowAutofillDialog(false);
    toast({
      title: "Suggestions applied",
      description: `Replaced ${selected.length} field(s) with organization intelligence suggestions.`,
    });
  };

  const getMemberDisplayName = (member: ListContactRecord) => {
    const fullName = (member.fullName || "").trim();
    if (fullName) return fullName;
    const firstLast = `${member.firstName || ""} ${member.lastName || ""}`.trim();
    if (firstLast) return firstLast;
    const emailPrefix = (member.email || "").split("@")[0];
    return emailPrefix || "Unknown";
  };

  const isContactIncluded = (contactId: string) => !excludedContactIdSet.has(contactId);

  const setContactsIncluded = (contactIds: string[], include: boolean) => {
    if (contactIds.length === 0) return;
    setExcludedContactIds((prev) => {
      const next = new Set(prev);
      for (const contactId of contactIds) {
        if (include) {
          next.delete(contactId);
        } else {
          next.add(contactId);
        }
      }
      return Array.from(next);
    });
  };

  const toggleContactSelection = (contactId: string, selected: boolean) => {
    setContactSelection((prev) => {
      const next = { ...prev };
      if (selected) next[contactId] = true;
      else delete next[contactId];
      return next;
    });
  };

  const setSelectionForIds = (contactIds: string[], selected: boolean) => {
    if (contactIds.length === 0) return;
    setContactSelection((prev) => {
      const next = { ...prev };
      for (const contactId of contactIds) {
        if (selected) next[contactId] = true;
        else delete next[contactId];
      }
      return next;
    });
  };

  const clearContactSelection = () => setContactSelection({});

  const updateTestSendRow = (
    rowId: string,
    field: "first_name" | "last_name" | "email" | "company" | "job_title",
    value: string
  ) => {
    setTestSendRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value, status: "idle", message: undefined } : row))
    );
  };

  const addTestSendRow = () => {
    setTestSendRows((prev) => [
      ...prev,
      createTestSendRow({
        company: templateSampleContact.company,
      }),
    ]);
  };

  const deleteTestSendRow = (rowId: string) => {
    setTestSendRows((prev) => {
      const next = prev.filter((row) => row.id !== rowId);
      return next.length > 0
        ? next
        : [
            createTestSendRow({
              company: templateSampleContact.company,
            }),
          ];
    });
  };

  const sendTestEmails = async () => {
    if (testSendRows.length === 0) {
      toast({
        title: "No test rows",
        description: "Add at least one test row before sending.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedSenderProfileId) {
      toast({
        title: "Sender required",
        description: "Select a sender before sending test emails.",
        variant: "destructive",
      });
      return;
    }
    if (!isValidEmail(replyToEmail)) {
      toast({
        title: "Reply-to required",
        description: "Enter a valid reply-to email before sending test emails.",
        variant: "destructive",
      });
      return;
    }
    if (!templateReady) {
      toast({
        title: "Template incomplete",
        description: "Add subject and body in Email Template step before test send.",
        variant: "destructive",
      });
      return;
    }

    const validatedRows = testSendRows.map((row) => {
      const email = row.email.trim();
      if (!email) {
        return { ...row, status: "invalid" as const, message: "Email is required" };
      }
      if (!isValidEmail(email)) {
        return { ...row, status: "invalid" as const, message: "Invalid email format" };
      }
      return { ...row, status: "idle" as const, message: undefined, email };
    });

    const invalidRows = validatedRows.filter((row) => row.status === "invalid");
    if (invalidRows.length > 0) {
      setTestSendRows(validatedRows);
      toast({
        title: "Invalid test rows",
        description: `Fix ${invalidRows.length} row(s) with invalid or missing email before sending.`,
        variant: "destructive",
      });
      return;
    }

    const rowsToSend = validatedRows.filter((row) => row.status === "idle");
    if (rowsToSend.length === 0) {
      return;
    }

    setIsSendingTests(true);
    setTestSendRows((prev) =>
      prev.map((row) =>
        rowsToSend.some((candidate) => candidate.id === row.id)
          ? { ...row, status: "sending", message: "Sending..." }
          : row
      )
    );

    let sentCount = 0;
    let failedCount = 0;

    await Promise.all(
      rowsToSend.map(async (row) => {
        const sample: TemplateSampleContact = {
          id: row.id,
          firstName: row.first_name.trim() || templateSampleContact.firstName,
          lastName: row.last_name.trim() || templateSampleContact.lastName,
          email: row.email.trim(),
          company: row.company.trim() || templateSampleContact.company,
          jobTitle: row.job_title.trim() || templateSampleContact.jobTitle,
        };

        const subject = replaceTemplateTokens(templateSubject, sample);
        const htmlTemplate = templateBodyHtml || bodyTextToHtml(templateBodyText);
        const html = replaceTemplateTokens(htmlTemplate, sample);

        try {
          const response = await apiRequest("POST", "/api/email/send-test", {
            to: row.email.trim(),
            subject,
            html,
            senderProfileId: selectedSenderProfileId,
            replyToEmail: replyToEmail.trim(),
          });
          const body = await response.json();

          if (body?.success) {
            sentCount += 1;
            setTestSendRows((prev) =>
              prev.map((candidate) =>
                candidate.id === row.id
                  ? {
                      ...candidate,
                      status: "sent",
                      message: body?.message || "Provider accepted test email",
                      sentAt: new Date().toISOString(),
                    }
                  : candidate
              )
            );
          } else {
            failedCount += 1;
            setTestSendRows((prev) =>
              prev.map((candidate) =>
                candidate.id === row.id
                  ? {
                      ...candidate,
                      status: "failed",
                      message: body?.message || "Provider rejected test email",
                    }
                  : candidate
              )
            );
          }
        } catch (error: any) {
          failedCount += 1;
          setTestSendRows((prev) =>
            prev.map((candidate) =>
              candidate.id === row.id
                ? {
                    ...candidate,
                    status: "failed",
                    message: error?.message || "Failed to send test email",
                  }
                : candidate
            )
          );
        }
      })
    );

    const attemptAt = new Date().toISOString();
    setTestSendSummary({
      lastAttemptAt: attemptAt,
      sentCount,
      failedCount,
    });

    if (failedCount > 0) {
      toast({
        title: "Test send completed with failures",
        description: `Sent: ${sentCount}, Failed: ${failedCount}`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Test send completed",
        description: `Provider accepted ${sentCount} test email(s).`,
      });
    }
    setIsSendingTests(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const linkageProjectId =
        firstNonEmptyString(selectedProjectId, selectedWorkOrder?.projectId, campaign?.projectId) || null;
      if (!selectedClientAccountId) {
        toast({
          title: "Organization required",
          description: "Select an organization before saving this email campaign.",
          variant: "destructive",
        });
        return;
      }
      if (!emailRoutingReady) {
        toast({
          title: "Email routing required",
          description: "Select a sender and provide a valid reply-to email before saving.",
          variant: "destructive",
        });
        return;
      }
      if (!isCreateMode && !linkageProjectId) {
        toast({
          title: "Project required",
          description: "Select a project before updating this campaign.",
          variant: "destructive",
        });
        return;
      }
      if (selectedAudienceSource === "segment" && !selectedSegmentId) {
        toast({
          title: "Audience required",
          description: "Select a segment before saving.",
          variant: "destructive",
        });
        return;
      }
      if (selectedAudienceSource === "list" && !selectedListId) {
        toast({
          title: "Audience required",
          description: "Select a static list before saving.",
          variant: "destructive",
        });
        return;
      }
      if (selectedAudienceSource === "list" && staticListIncludedCount  listMemberIdSet.has(contactId))
          : [];
      const persistedTemplate: PersistedAdminEmailTemplateConfig = {
        tone: templateTone,
        design: templateDesign,
        subject: templateSubject.trim(),
        preheader: templatePreheader.trim(),
        bodyText: templateBodyText.trim(),
        bodyHtml: templateBodyHtml,
        promptSource: templatePromptSource,
        promptKey: templatePromptKey,
        personalizationTokens: SUPPORTED_PERSONALIZATION_TOKENS,
      };
      const persistedTestSend: PersistedAdminEmailTestSendConfig = {
        rows: testSendRows.map((row) => ({
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          email: row.email.trim(),
          company: row.company.trim(),
          job_title: row.job_title.trim(),
        })),
        lastAttemptAt: testSendSummary.lastAttemptAt,
        sentCount: testSendSummary.sentCount,
        failedCount: testSendSummary.failedCount,
      };

      const payload = {
        type: form.channel === "combo" ? "combo" : "email",
        enabledChannels: form.channel === "combo" ? ["email", "voice"] : ["email"],
        status: campaign?.status || "draft",
        clientAccountId: selectedClientAccountId,
        ...(linkageProjectId ? { projectId: linkageProjectId } : {}),
        name: form.name.trim(),
        campaignObjective: form.objective.trim(),
        productServiceInfo: form.description.trim() || null,
        targetAudienceDescription: form.targetAudience.trim() || null,
        successCriteria: form.successCriteria.trim() || null,
        landingPageUrl: form.landingPageUrl.trim() || null,
        senderProfileId: selectedSenderProfileId || null,
        senderName: firstNonEmptyString(selectedSender?.fromName, selectedSender?.name) || null,
        fromEmail: selectedSender?.fromEmail || null,
        replyToEmail: replyToEmail.trim() || null,
        campaignProviderId: selectedSender?.campaignProviderId || selectedSender?.campaignProvider?.id || null,
        campaignProviderKey: selectedSender?.campaignProvider?.providerKey || null,
        campaignProviderName: selectedSender?.campaignProvider?.name || null,
        campaignProviderHealthStatus: selectedSender?.campaignProvider?.healthStatus || null,
        domainAuthId: selectedSender?.domainAuthId || null,
        audienceRefs: {
          ...nextAudienceRefs,
          wizardDetails: {
            ...(existingRefs.wizardDetails || {}),
            targetJobTitles: form.targetJobTitles,
            targetIndustries: form.targetIndustries,
            uploadedFromAdminWizard: true,
            setupCompletedAt: new Date().toISOString(),
            setupCompletedBy: "admin",
            adminEmailAudience: {
              source: selectedAudienceSource,
              segmentId: selectedAudienceSource === "segment" ? selectedSegmentId || null : null,
              segmentName: selectedAudienceSource === "segment" ? selectedSegment?.name || null : null,
              listId: selectedAudienceSource === "list" ? selectedListId || null : null,
              listName: selectedAudienceSource === "list" ? selectedList?.name || null : null,
              excludedContactIds: persistedExcludedIds,
              totalContacts: selectedAudienceSource === "list" ? staticListTotalCount : selectedSegment?.recordCountCache || null,
              includedContacts: selectedAudienceSource === "list" ? staticListIncludedCount : null,
              excludedContacts: selectedAudienceSource === "list" ? staticListExcludedCount : null,
            } satisfies PersistedAdminAudienceConfig,
            adminEmailTemplate: persistedTemplate,
            adminEmailTestSend: persistedTestSend,
          },
        } as any,
      };

      const response = isCreateMode
        ? await apiRequest("POST", "/api/campaigns", payload)
        : await apiRequest("PATCH", `/api/campaigns/${campaignId}`, payload);
      const savedCampaign = await response.json();

      toast({
        title: isCreateMode ? "Campaign created" : "Campaign setup saved",
        description: isCreateMode
          ? "Draft email campaign created successfully."
          : "Campaign updated successfully.",
      });

      if (isCreateMode && savedCampaign?.id) {
        setLocation(`/campaigns/email/${savedCampaign.id}/edit`);
        return;
      }
      setLocation("/campaigns?tab=email");
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message || "Failed to save campaign setup", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!campaignId && !isCreateMode) {
    return (
      
        
          
            Campaign Not Found
            Unable to resolve campaign ID from this route.
          
          
             setLocation("/campaigns?tab=email")}>Back to Campaigns
          
        
      
    );
  }

  if ((!isCreateMode && campaignLoading) || !initialized) {
    return (
      
        
      
    );
  }

  if (!isCreateMode && (campaignError || !campaign)) {
    return (
      
        
          
            Failed to load campaign
            We could not load this campaign for editing.
          
          
             setLocation("/campaigns?tab=email")}>Back to Campaigns
          
        
      
    );
  }

  const currentStep = STEPS[step];
  const pageTitle = isCreateMode ? "Email Campaign Setup" : "Edit Email Campaign Setup";
  const pageDescription = isCreateMode
    ? "Create a draft email campaign using the same guided setup used for existing campaigns."
    : "Edit this email campaign with the same guided setup used during creation.";
  const primarySaveLabel = isCreateMode ? "Create Campaign" : "Save Setup";

  return (
    
      
        
          {pageTitle}
          {pageDescription}
        
         setLocation("/campaigns?tab=email")}> 
          
          Back to Campaigns
        
      

      
        
          
            Step {step + 1} of {STEPS.length}
            {currentStep.label}
          
          
          
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const active = idx === step;
              const complete = idx 
                  
                  {s.label}
                
              );
            })}
          
        
      

      {step === 0 && (
        
          
            Channel
            Select campaign outreach channel. Client-submitted value is prefilled.
          
          
             setForm((prev) => ({ ...prev, channel: value as WizardChannel }))}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              
                
                
                  
                
                
                  Email Campaign
                  Personalized email outreach with AI-generated content
                
                
                  Submitted by client
                  {form.channel === "email" && Selected}
                
              

              
                
                
                  
                
                
                  Phone + Email
                  Multi-channel outreach combining voice and email
                
                {form.channel === "combo" && Selected}
              
            
          
        
      )}

      {step === 1 && (
        
          
            Campaign Basics
            
              Give your campaign a name and describe what you want to achieve.
              * marks required fields.
            
          
          
            
              
                Campaign Name * Submitted by client
              
               setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            
            
              
                Campaign Objective * Submitted by client
              
               setForm((prev) => ({ ...prev, objective: e.target.value }))}
                rows={3}
              />
              Describe what you want this campaign to accomplish
            
            
              
                Additional Description (optional) Submitted by client
              
               setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            

            
              
                Ownership Linkage
                
                  Auto-selected from client, project, and work order context when available. You can still override the linkage.
                
              

              
                
                  
                    Organization *
                  
                   {
                      const nextOrg = value === "__none" ? "" : value;
                      setSelectedClientAccountId(nextOrg);
                      if (selectedProject && selectedProject.clientAccountId && selectedProject.clientAccountId !== nextOrg) {
                        setSelectedProjectId("");
                      }
                      if (selectedWorkOrder && selectedWorkOrder.clientAccountId !== nextOrg) {
                        setSelectedWorkOrderId("");
                      }
                    }}
                  >
                    
                      
                    
                    
                      Unassigned
                      {clientAccounts.map((client) => (
                        
                          {client.name}
                        
                      ))}
                    
                  
                

                
                  Project
                   {
                      const nextProjectId = value === "__none" ? "" : value;
                      setSelectedProjectId(nextProjectId);
                      const nextProject = clientProjects.find((project) => project.id === nextProjectId) || null;
                      if (nextProject?.clientAccountId && nextProject.clientAccountId !== selectedClientAccountId) {
                        setSelectedClientAccountId(nextProject.clientAccountId);
                      }
                      if (selectedWorkOrder && selectedWorkOrder.projectId !== nextProjectId) {
                        setSelectedWorkOrderId("");
                      }
                    }}
                  >
                    
                      
                    
                    
                      Unassigned
                      {clientProjects.map((project) => (
                        
                          {project.name}
                        
                      ))}
                    
                  
                

                
                  Work Order
                   {
                      const nextWorkOrderId = value === "__none" ? "" : value;
                      setSelectedWorkOrderId(nextWorkOrderId);
                      if (!nextWorkOrderId) return;
                      const selected = adminOrders?.find((row) => row.order.id === nextWorkOrderId)?.order;
                      if (selected?.clientAccountId && selected.clientAccountId !== selectedClientAccountId) {
                        setSelectedClientAccountId(selected.clientAccountId);
                      }
                      if (selected?.projectId) {
                        setSelectedProjectId(selected.projectId);
                      }
                    }}
                  >
                    
                      
                    
                    
                      Unassigned
                      {filteredWorkOrders.map((order) => (
                        
                          {(order.title || `Order ${order.id.slice(0, 8)}`)} ({order.status})
                        
                      ))}
                    
                  
                
              

              
                {!!projectRequest?.name && (
                  
                    Linked request: {projectRequest.name}
                  
                )}
                {!!selectedProject?.description && (
                  
                    Project context: {selectedProject.description}
                  
                )}
                {!!relatedOrder?.description && (
                  
                    Order context: {relatedOrder.description}
                  
                )}
              
            

            
              
                Email Routing
                
                  Choose the sender identity and reply inbox used for test sends, launch, and delivery reporting.
                
              

              
                
                  
                    Sender *
                  
                  {senderProfilesLoading ? (
                    
                      
                    
                  ) : (
                     {
                        const nextSenderId = value === "__none" ? "" : value;
                        setSelectedSenderProfileId(nextSenderId);
                        const nextSender = senderProfiles.find((sender) => sender.id === nextSenderId);
                        if (nextSender) {
                          setReplyToEmail(nextSender.replyToEmail || nextSender.replyTo || nextSender.fromEmail || "");
                        }
                      }}
                    >
                      
                        
                      
                      
                        No sender selected
                        {senderProfiles.map((sender) => (
                          
                            {firstNonEmptyString(sender.fromName, sender.name)} &lt;{sender.fromEmail}&gt;
                          
                        ))}
                      
                    
                  )}
                

                
                  
                    Reply-To Email *
                  
                   setReplyToEmail(e.target.value)}
                    className={replyToEmail && !isValidEmail(replyToEmail) ? "border-red-300" : ""}
                  />
                  
                    Replies should route to the monitored campaign inbox.
                  
                
              

              {selectedSender && (
                
                  
                    {firstNonEmptyString(selectedSender.fromName, selectedSender.name)} &lt;{selectedSender.fromEmail}&gt;
                  
                  
                    Provider: {selectedSender.campaignProvider?.name || selectedSender.campaignProvider?.providerKey || "Default routing"}
                  
                  
                    Reply-To: {replyToEmail || selectedSender.replyToEmail || selectedSender.replyTo || selectedSender.fromEmail}
                  
                
              )}
            
          
        
      )}

      {step === 2 && (
        
          
            Campaign Details
            
              All fields below are optional. Fill in what you can. Client-submitted values are editable.
            
          
          
            
              
                
                  
                  
                    Organization Intelligence
                    
                      Automatically populate campaign details from the organization profile.
                    
                    {!organizationIntelligence?.organization && (
                      
                        No org profile found for the selected organization.
                      
                    )}
                  
                
                
                  {orgAutofillLoading ? (
                    <>
                      
                      Loading...
                    
                  ) : (
                    <>
                      
                      Populate
                    
                  )}
                
              
            

            
              
                
                  
                     Target Audience Submitted by client
                  
                   setForm((prev) => ({ ...prev, targetAudience: e.target.value }))}
                    rows={2}
                  />
                

                
                  
                     Target Industries Submitted by client
                  
                  
                     setIndustryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addArrayItem("targetIndustries", industryInput, () => setIndustryInput(""));
                        }
                      }}
                    />
                     addArrayItem("targetIndustries", industryInput, () => setIndustryInput(""))}>Add
                  
                  {form.targetIndustries.length > 0 && (
                    
                      {form.targetIndustries.map((industry) => (
                        
                          {industry}
                           removeArrayItem("targetIndustries", industry)} />
                        
                      ))}
                    
                  )}
                

                
                  
                     Target Job Titles Submitted by client
                  
                  
                     setJobTitleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addArrayItem("targetJobTitles", jobTitleInput, () => setJobTitleInput(""));
                        }
                      }}
                    />
                     addArrayItem("targetJobTitles", jobTitleInput, () => setJobTitleInput(""))}>Add
                  
                  {form.targetJobTitles.length > 0 && (
                    
                      {form.targetJobTitles.map((title) => (
                        
                          {title}
                           removeArrayItem("targetJobTitles", title)} />
                        
                      ))}
                    
                  )}
                
              

              
                
                  
                    Success Criteria Submitted by client
                  
                   setForm((prev) => ({ ...prev, successCriteria: e.target.value }))}
                    rows={2}
                  />
                

                
                  
                     Landing Page URL Submitted by client
                  
                   setForm((prev) => ({ ...prev, landingPageUrl: e.target.value }))}
                    className="max-w-lg"
                  />
                  Where prospects should be directed after engagement
                
              
            
          
        
      )}

      {step === 3 && (
        
          
            Audience (Admin Only)
            
              Choose audience source using the same pattern as call campaigns. Static lists support row-level include/exclude.
            
          
          
            
              
                Audience Source
                Select Segment or Static List before reviewing this campaign.
              
               {
                  const nextSource = value as AudienceSource;
                  setSelectedAudienceSource(nextSource);
                  setContactSelection({});
                  if (nextSource === "segment") {
                    setSelectedListId("");
                    setExcludedContactIds([]);
                  } else {
                    setSelectedSegmentId("");
                  }
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                
                  
                  
                  
                    Segment
                    Use dynamic audience segment
                  
                
                
                  
                  
                  
                    Static List
                    Choose uploaded contact list and refine contacts
                  
                
              
            

            {selectedAudienceSource === "segment" && (
              
                Segment
                 setSelectedSegmentId(value === "__none" ? "" : value)}
                >
                  
                    
                  
                  
                    Select segment
                    {contactSegments.map((segment) => (
                      
                        {segment.name}
                      
                    ))}
                  
                
                
                  Estimated contacts: {segmentAudienceCount.toLocaleString()}
                  {selectedSegment && Selected: {selectedSegment.name}}
                
              
            )}

            {selectedAudienceSource === "list" && (
              
                
                  Static List
                   {
                      const nextListId = value === "__none" ? "" : value;
                      setSelectedListId(nextListId);
                      setContactSelection({});
                      const keepPersistedExclusions =
                        nextListId &&
                        nextListId === persistedAudienceConfig?.listId &&
                        selectedAudienceSource === persistedAudienceConfig?.source;
                      setExcludedContactIds(keepPersistedExclusions ? normalizeTextArray(persistedAudienceConfig?.excludedContactIds) : []);
                    }}
                  >
                    
                      
                    
                    
                      Select static list
                      {contactLists.map((list) => (
                        
                          {list.name}
                        
                      ))}
                    
                  
                

                {!!selectedListId && (
                  <>
                    
                       setListSearchQuery(e.target.value)}
                        className="max-w-lg"
                      />
                      
                         setSelectionForIds(pageContactIds, !allPageSelected)}>
                          {allPageSelected ? "Unselect page" : "Select all page"}
                        
                        
                            setSelectionForIds(
                              filteredListMembers.map((member) => member.id).filter((id): id is string => typeof id === "string" && id.length > 0),
                              !allFilteredSelected
                            )
                          }
                        >
                          {allFilteredSelected ? "Unselect filtered" : "Select all filtered"}
                        
                         setContactsIncluded(selectedContactIds, true)}>
                          Include selected
                        
                         setContactsIncluded(selectedContactIds, false)}>
                          Exclude selected
                        
                        
                          Clear selection
                        
                      
                    

                    
                      Total: {staticListTotalCount.toLocaleString()}
                      Included: {staticListIncludedCount.toLocaleString()}
                      Excluded: {staticListExcludedCount.toLocaleString()}
                      {selectedCount > 0 && Selected rows: {selectedCount}}
                    

                    
                      
                        
                          
                            Select
                            Include
                            Name
                            Email
                            Company
                            Title
                            Status
                          
                        
                        
                          {listMembersLoading ? (
                            
                              
                                
                                  
                                  Loading list contacts...
                                
                              
                            
                          ) : pagedListMembers.length === 0 ? (
                            
                              
                                No contacts found for this list/filter.
                              
                            
                          ) : (
                            pagedListMembers.map((member) => {
                              const contactId = member.id;
                              const included = isContactIncluded(contactId);
                              return (
                                
                                  
                                     toggleContactSelection(contactId, !!checked)}
                                    />
                                  
                                  
                                     setContactsIncluded([contactId], !!checked)}
                                    />
                                  
                                  {getMemberDisplayName(member)}
                                  {member.email || "-"}
                                  {member.accountName || member.account?.name || "-"}
                                  {member.jobTitle || "-"}
                                  
                                    {included ? (
                                      Included
                                    ) : (
                                      Excluded
                                    )}
                                  
                                
                              );
                            })
                          )}
                        
                      
                    

                    
                      
                        Showing {(activePage - 1) * pageSize + (pagedListMembers.length > 0 ? 1 : 0)}-
                        {(activePage - 1) * pageSize + pagedListMembers.length} of {filteredListMembers.length} filtered contact(s)
                      
                      
                         setListPage((prev) => Math.max(prev - 1, 1))}
                        >
                          Prev
                        
                        
                          Page {activePage} of {totalPages}
                        
                        = totalPages}
                          onClick={() => setListPage((prev) => Math.min(prev + 1, totalPages))}
                        >
                          Next
                        
                      
                    
                  
                )}
              
            )}
          
        
      )}

      {step === 4 && (
        
          
            Email Template
            
              Reuse the admin email preview style to finalize subject, body, tone, and design before review.
            
          
          
            
              
                Tone
                 void applyGeneratedTemplate(value as TemplateTone, templateDesign)}
                >
                  
                    
                  
                  
                    Professional
                    Friendly
                    Direct
                  
                
              
              
                Design
                 void applyGeneratedTemplate(templateTone, value as TemplateDesign)}
                >
                  
                    
                  
                  
                    Plain
                    Branded
                    Newsletter
                    Argyle Brand
                  
                
              
              
                 void applyGeneratedTemplate(templateTone, templateDesign)}
                >
                  Regenerate from Tone + Design
                
              
            

            {templateDesign === "argyle-brand" && (
              
                Using Argyle palette
                {" "}
                ({brandPaletteResponse?.palette?.source === "website-css" ? "auto-detected from argyleforum.com CSS" : "fallback defaults"}).
              
            )}

            
              Subject Line
               setTemplateSubject(e.target.value)}
                placeholder="Write a clear subject line..."
              />
            

            
              Preheader
               setTemplatePreheader(e.target.value)}
                placeholder="Add short preview text shown after the subject..."
              />
            

            
              Email Body (Text Fallback)
               setTemplateBodyText(e.target.value)}
                rows={8}
                placeholder="Write the email body. HTML preview updates automatically."
              />
              
                HTML preview is generated from this body text and selected design.
              
            

            
              
                
                  Supported Personalization Tokens
                  
                    Preview sample: {templateSampleContact.firstName} {templateSampleContact.lastName} ({templateSampleContact.company})
                  
                
                 setShowTemplatePreviewModal(true)}>
                  Open Full Preview
                
              
              
                 {
                    if (!hasLandingPageUrl) return;
                    window.open(landingPageUrlForTemplate, "_blank", "noopener,noreferrer");
                  }}
                >
                  View brief
                
                {!hasLandingPageUrl && (
                  No landing page URL provided.
                )}
              
              
                {SUPPORTED_PERSONALIZATION_TOKENS.map((token) => (
                  
                    {token}
                  
                ))}
              
            

            
              
                Rendered Subject
                {templateRenderedSubject || "-"}
                Rendered Preheader
                {templateRenderedPreheader || "-"}
                Rendered Text Fallback
                
                  {templateRenderedBodyText || "-"}
                
              
              
                HTML Preview
                
                  
                      
                        
                          
                          
                          
                            body { margin: 0; padding: 16px; background: #f8fafc; }
                            img { max-width: 100%; height: auto; }
                          
                        
                        ${sanitizeHtmlForIframePreview(templateRenderedHtmlWithTargets)}
                      
                    `}
                    className="h-full w-full border-0"
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                  />
                
              
            
          
        
      )}

      {step === 5 && (
        
          
            Test Send
            
              Add test recipients using the same contact column format, then send the current template and review per-row delivery results.
            
          
          
            
              
                Rows: {testSendStatusCounts.total}
                Sent: {testSendStatusCounts.sent}
                Failed: {testSendStatusCounts.failed}
                {testSendStatusCounts.invalid > 0 && (
                  Invalid: {testSendStatusCounts.invalid}
                )}
                {testSendSummary.lastAttemptAt && (
                  
                    Last test: {new Date(testSendSummary.lastAttemptAt).toLocaleString()}
                  
                )}
              
              
                
                  
                  Add Row
                
                 void sendTestEmails()} disabled={isSendingTests || !templateReady}>
                  {isSendingTests ?  : }
                  Send Test
                
              
            

            
              
                
                  
                    first_name
                    last_name
                    email
                    company
                    job_title
                    Status
                    Action
                  
                
                
                  {testSendRows.length === 0 ? (
                    
                      
                        No test rows yet.
                      
                    
                  ) : (
                    testSendRows.map((row) => (
                      
                        
                           updateTestSendRow(row.id, "first_name", e.target.value)}
                            placeholder="Alex"
                            disabled={isSendingTests}
                          />
                        
                        
                           updateTestSendRow(row.id, "last_name", e.target.value)}
                            placeholder="Taylor"
                            disabled={isSendingTests}
                          />
                        
                        
                           updateTestSendRow(row.id, "email", e.target.value)}
                            placeholder="alex@example.com"
                            disabled={isSendingTests}
                            className={row.status === "invalid" || row.status === "failed" ? "border-red-300" : ""}
                          />
                        
                        
                           updateTestSendRow(row.id, "company", e.target.value)}
                            placeholder="Acme"
                            disabled={isSendingTests}
                          />
                        
                        
                           updateTestSendRow(row.id, "job_title", e.target.value)}
                            placeholder="Director"
                            disabled={isSendingTests}
                          />
                        
                        
                          
                            {row.status === "sent" && sent}
                            {row.status === "failed" && failed}
                            {row.status === "invalid" && invalid}
                            {row.status === "sending" && sending...}
                            {row.status === "idle" && pending}
                            {row.message && {row.message}}
                          
                        
                        
                           deleteTestSendRow(row.id)}
                            disabled={isSendingTests}
                          >
                            
                          
                        
                      
                    ))
                  )}
                
              
            
          
        
      )}

      {step === 6 && (
        
          
            Review
            Confirm campaign fields and audience selection before saving.
          
          
            
              
                Channel
                {form.channel === "combo" ? "Phone + Email" : "Email"}
              
              
                Campaign Name
                {form.name}
              
              
                Sender
                
                  {selectedSender
                    ? `${firstNonEmptyString(selectedSender.fromName, selectedSender.name)} `
                    : "-"}
                
                
                  {selectedSender?.campaignProvider?.name || selectedSender?.campaignProvider?.providerKey || "Default routing"}
                
              
              
                Reply-To
                {replyToEmail || "-"}
              
              
                Objective
                {form.objective || "-"}
              
              
                Additional Description
                {form.description || "-"}
              
              
                Target Audience
                {form.targetAudience || "-"}
              
              
                Success Criteria
                {form.successCriteria || "-"}
              
              
                Target Job Titles
                {form.targetJobTitles.length > 0 ? form.targetJobTitles.join(", ") : "-"}
              
              
                Target Industries
                {form.targetIndustries.length > 0 ? form.targetIndustries.join(", ") : "-"}
              
              
                Landing Page URL
                {form.landingPageUrl || "-"}
              
              
                Audience Source
                
                  {selectedAudienceSource === "segment" ? "Segment" : "Static List"}:{" "}
                  {selectedAudienceSource === "segment" ? selectedSegment?.name || "-" : selectedList?.name || "-"}
                
                {selectedAudienceSource === "segment" ? (
                  
                    Estimated contacts: {segmentAudienceCount.toLocaleString()}
                  
                ) : (
                  
                    Total: {staticListTotalCount.toLocaleString()} | Included: {staticListIncludedCount.toLocaleString()} | Excluded: {staticListExcludedCount.toLocaleString()}
                  
                )}
              
              
                Email Template
                
                  Tone: {templateTone[0].toUpperCase() + templateTone.slice(1)} | Design: {getTemplateDesignLabel(templateDesign)}
                
                Subject
                {templateSubject || "-"}
                Preheader
                {templatePreheader || "-"}
                Body (text fallback)
                {templateBodyText || "-"}
                Supported tokens
                
                  {SUPPORTED_PERSONALIZATION_TOKENS.map((token) => (
                    
                      {token}
                    
                  ))}
                
              
              
                Test Send
                
                  Rows: {testSendStatusCounts.total} | Sent: {testSendStatusCounts.sent} | Failed: {testSendStatusCounts.failed}
                
                
                  {testSendSummary.lastAttemptAt
                    ? `Last attempted: ${new Date(testSendSummary.lastAttemptAt).toLocaleString()}`
                    : "No test send attempted yet."}
                
              
            
          
        
      )}

      
        
          
            Apply Organization Intelligence Replacements
            
              Empty fields were already filled automatically. Select any existing values you want to replace with suggestions.
            
          

          
            {autofillCandidates.map((candidate) => {
              const currentValue = Array.isArray(candidate.currentValue)
                ? candidate.currentValue.join(", ")
                : candidate.currentValue;
              const suggestedValue = Array.isArray(candidate.suggestedValue)
                ? candidate.suggestedValue.join(", ")
                : candidate.suggestedValue;

              return (
                
                  
                    
                        setAutofillSelections((prev) => ({ ...prev, [candidate.key]: !!checked }))
                      }
                    />
                    
                      {candidate.label}
                      
                        Current
                        {currentValue || "-"}
                      
                      
                        Suggested
                        {suggestedValue || "-"}
                      
                    
                  
                
              );
            })}
          

          
             setShowAutofillDialog(false)}>Cancel
            Apply Selected
          
        
      

      

      
         setStep((prev) => Math.max(prev - 1, 0))}>
          
          Back
        

        {step  setStep((prev) => Math.min(prev + 1, STEPS.length - 1))}>
            Next
            
          
        ) : (
           void handleSave()}>
            {isSaving ?  : }
            {primarySaveLabel}
          
        )}
      
    
  );
}