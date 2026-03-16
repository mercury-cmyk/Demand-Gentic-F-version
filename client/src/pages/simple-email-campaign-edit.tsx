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
  rows?: Array<{
    first_name?: string;
    last_name?: string;
    email?: string;
    company?: string;
    job_title?: string;
  }>;
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
  campaigns?: Array<{ id: string; name: string; status: string; type: string }>;
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
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyTextToHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "<p></p>";
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtmlValue(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function withExternalAnchorTargets(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const hasTarget = /\btarget\s*=/.test(attrs);
    const hasRel = /\brel\s*=/.test(attrs);
    const nextAttrs = `${attrs}${hasTarget ? "" : ' target="_blank"'}${hasRel ? "" : ' rel="noopener noreferrer"'}`;
    return `<a${nextAttrs}>`;
  });
}

function createTestSendRow(partial?: Partial<TestSendRow>): TestSendRow {
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

  const subjectByTone: Record<TemplateTone, string> = {
    professional: `${safeCampaignName}: a relevant idea for {{company}}`,
    friendly: `Quick thought for {{company}}, {{firstName}}`,
    direct: `{{firstName}}, quick win for {{company}}`,
  };
  const preheaderByTone: Record<TemplateTone, string> = {
    professional: `Focused outreach for ${safeObjective}.`,
    friendly: `Quick note on ${safeObjective}.`,
    direct: `Fast path to ${safeObjective}.`,
  };

  const openerByTone: Record<TemplateTone, string> = {
    professional: "Hi {{firstName}},",
    friendly: "Hi {{firstName}}, hope you're doing well.",
    direct: "Hi {{firstName}},",
  };

  const closeByTone: Record<TemplateTone, string> = {
    professional: "If this is relevant, I can share a short plan tailored to {{company}}.",
    friendly: "If helpful, I can send a short plan tailored to {{company}}.",
    direct: "If useful, I can send a focused plan for {{company}}.",
  };

  const ctaByTone: Record<TemplateTone, string> = {
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
  const ctaByTone: Record<TemplateTone, string> = {
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

export function SimpleEmailCampaignEditPage({ mode = "edit" }: SimpleEmailCampaignSetupPageProps = {}) {
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
  const [form, setForm] = useState<EditFormState>(DEFAULT_FORM);
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [orgAutofillLoading, setOrgAutofillLoading] = useState(false);

  const [jobTitleInput, setJobTitleInput] = useState("");
  const [industryInput, setIndustryInput] = useState("");
  const [showAutofillDialog, setShowAutofillDialog] = useState(false);
  const [autofillCandidates, setAutofillCandidates] = useState<AutofillCandidate[]>([]);
  const [autofillSelections, setAutofillSelections] = useState<Record<AutofillFieldKey, boolean>>({
    description: false,
    targetAudience: false,
    successCriteria: false,
    targetJobTitles: false,
    targetIndustries: false,
    landingPageUrl: false,
  });

  const [selectedAudienceSource, setSelectedAudienceSource] = useState<AudienceSource>("segment");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedSenderProfileId, setSelectedSenderProfileId] = useState<string>("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [excludedContactIds, setExcludedContactIds] = useState<string[]>([]);
  const [contactSelection, setContactSelection] = useState<Record<string, boolean>>({});
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [listPage, setListPage] = useState(1);
  const [selectedClientAccountId, setSelectedClientAccountId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string>("");
  const [templateTone, setTemplateTone] = useState<TemplateTone>(DEFAULT_TEMPLATE_TONE);
  const [templateDesign, setTemplateDesign] = useState<TemplateDesign>(DEFAULT_TEMPLATE_DESIGN);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templatePreheader, setTemplatePreheader] = useState("");
  const [templateBodyText, setTemplateBodyText] = useState("");
  const [templateBodyHtml, setTemplateBodyHtml] = useState("");
  const [templatePromptSource, setTemplatePromptSource] = useState("default fallback");
  const [templatePromptKey, setTemplatePromptKey] = useState<string | null>(null);
  const [showTemplatePreviewModal, setShowTemplatePreviewModal] = useState(false);
  const initialPromptTemplateLoadedRef = useRef(false);
  const [testSendRows, setTestSendRows] = useState<TestSendRow[]>([]);
  const [isSendingTests, setIsSendingTests] = useState(false);
  const [testSendSummary, setTestSendSummary] = useState<{
    lastAttemptAt: string | null;
    sentCount: number;
    failedCount: number;
  }>({
    lastAttemptAt: null,
    sentCount: 0,
    failedCount: 0,
  });

  const { data: campaign, isLoading: campaignLoading, error: campaignError } = useQuery<CampaignRecord>({
    queryKey: ["admin-email-campaign", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/campaigns/${campaignId}`);
      return res.json();
    },
  });

  const { data: clientAccounts = [] } = useQuery<ClientAccountRecord[]>({
    queryKey: ["admin-email-campaign-client-accounts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/clients");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: clientProjects = [], isLoading: clientProjectsLoading } = useQuery<ClientProjectRecord[]>({
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

  const { data: senderProfiles = [], isLoading: senderProfilesLoading } = useQuery<ManagedSenderProfile[]>({
    queryKey: ["admin-email-campaign-sender-profiles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email-management/sender-profiles");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: adminOrders } = useQuery<AdminOrderRow[]>({
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

  const { data: projectRequest } = useQuery<ProjectRequestRecord | null>({
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

  const { data: organizationIntelligence } = useQuery<OrganizationIntelligenceResponse | null>({
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

  const { data: brandPaletteResponse } = useQuery<AdminBrandPaletteResponse | null>({
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

  const argylePaletteOverrides = useMemo<BrandPaletteOverrides>(() => {
    const serverPalette =
      brandPaletteResponse?.palette?.key === "argyle"
        ? brandPaletteResponse.palette.overrides
        : brandPaletteResponse?.fallback?.key === "argyle"
          ? brandPaletteResponse.fallback.overrides
          : null;
    return serverPalette || DEFAULT_ARGYLE_BRAND_OVERRIDES;
  }, [brandPaletteResponse]);

  const { data: segments = [] } = useQuery<SegmentRecord[]>({
    queryKey: ["admin-email-campaign-segments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/segments");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: lists = [] } = useQuery<ListRecord[]>({
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

  const persistedAudienceConfig = useMemo<PersistedAdminAudienceConfig | null>(() => {
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

  const persistedTemplateConfig = useMemo<PersistedAdminEmailTemplateConfig | null>(() => {
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

  const persistedTestSendConfig = useMemo<PersistedAdminEmailTestSendConfig | null>(() => {
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
  } = useQuery<ListContactRecord[]>({
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

  const templateSampleContact = useMemo<TemplateSampleContact>(() => {
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
      const next: Record<string, boolean> = {};
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

  const buildOrgIntelligenceSuggestions = (): Partial<Pick<EditFormState, AutofillFieldKey>> => {
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
      const candidateFields: Array<{ key: AutofillFieldKey; label: string }> = [
        { key: "description", label: "Additional Description" },
        { key: "targetAudience", label: "Target Audience" },
        { key: "successCriteria", label: "Success Criteria" },
        { key: "targetJobTitles", label: "Target Job Titles" },
        { key: "targetIndustries", label: "Target Industries" },
        { key: "landingPageUrl", label: "Landing Page URL" },
      ];

      const emptyUpdates: Partial<EditFormState> = {};
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
      if (selectedAudienceSource === "list" && staticListIncludedCount <= 0) {
        toast({
          title: "No contacts included",
          description: "Include at least one contact from the selected static list.",
          variant: "destructive",
        });
        return;
      }
      if (!templateReady) {
        toast({
          title: "Template required",
          description: "Subject line and email body are required before saving.",
          variant: "destructive",
        });
        return;
      }

      const existingRefs = (campaign?.audienceRefs || {}) as any;
      const nextAudienceRefs: any = { ...existingRefs };
      delete nextAudienceRefs.lists;
      delete nextAudienceRefs.selectedLists;
      delete nextAudienceRefs.segments;
      delete nextAudienceRefs.selectedSegments;
      delete nextAudienceRefs.filterGroup;

      nextAudienceRefs.source = selectedAudienceSource;
      if (selectedAudienceSource === "list") {
        nextAudienceRefs.lists = selectedListId ? [selectedListId] : [];
        nextAudienceRefs.selectedLists = selectedListId ? [selectedListId] : [];
      } else {
        nextAudienceRefs.segments = selectedSegmentId ? [selectedSegmentId] : [];
        nextAudienceRefs.selectedSegments = selectedSegmentId ? [selectedSegmentId] : [];
      }

      const persistedExcludedIds =
        selectedAudienceSource === "list"
          ? excludedContactIds.filter((contactId) => listMemberIdSet.has(contactId))
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Campaign Not Found</CardTitle>
            <CardDescription>Unable to resolve campaign ID from this route.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/campaigns?tab=email")}>Back to Campaigns</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((!isCreateMode && campaignLoading) || !initialized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isCreateMode && (campaignError || !campaign)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Failed to load campaign</CardTitle>
            <CardDescription>We could not load this campaign for editing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/campaigns?tab=email")}>Back to Campaigns</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = STEPS[step];
  const pageTitle = isCreateMode ? "Email Campaign Setup" : "Edit Email Campaign Setup";
  const pageDescription = isCreateMode
    ? "Create a draft email campaign using the same guided setup used for existing campaigns."
    : "Edit this email campaign with the same guided setup used during creation.";
  const primarySaveLabel = isCreateMode ? "Create Campaign" : "Save Setup";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/campaigns?tab=email")}> 
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Step {step + 1} of {STEPS.length}</span>
            <span>{currentStep.label}</span>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} className="mt-3" />
          <div
            className="mt-4 grid gap-2 text-xs"
            style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
          >
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const active = idx === step;
              const complete = idx < step;
              return (
                <div key={s.id} className={`flex items-center gap-2 rounded-md border px-2 py-2 ${active ? "border-primary bg-primary/5" : ""}`}>
                  <Icon className={`h-3.5 w-3.5 ${complete ? "text-green-600" : active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Channel</CardTitle>
            <CardDescription>Select campaign outreach channel. Client-submitted value is prefilled.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={form.channel}
              onValueChange={(value) => setForm((prev) => ({ ...prev, channel: value as WizardChannel }))}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <Label
                htmlFor="admin-channel-email"
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-6 cursor-pointer transition-all hover:shadow-md",
                  form.channel === "email" ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-primary/30"
                )}
              >
                <RadioGroupItem value="email" id="admin-channel-email" className="sr-only" />
                <div className={cn("rounded-full p-4", form.channel === "email" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Mail className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-base">Email Campaign</p>
                  <p className="text-xs text-muted-foreground mt-1">Personalized email outreach with AI-generated content</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Submitted by client</Badge>
                  {form.channel === "email" && <Badge variant="default">Selected</Badge>}
                </div>
              </Label>

              <Label
                htmlFor="admin-channel-combo"
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-6 cursor-pointer transition-all hover:shadow-md",
                  form.channel === "combo" ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-primary/30"
                )}
              >
                <RadioGroupItem value="combo" id="admin-channel-combo" className="sr-only" />
                <div className={cn("rounded-full p-4", form.channel === "combo" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Layers className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-base">Phone + Email</p>
                  <p className="text-xs text-muted-foreground mt-1">Multi-channel outreach combining voice and email</p>
                </div>
                {form.channel === "combo" && <Badge variant="default">Selected</Badge>}
              </Label>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Basics</CardTitle>
            <CardDescription>
              Give your campaign a name and describe what you want to achieve.
              <span className="text-red-500 ml-1">*</span> marks required fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="font-medium">
                Campaign Name <span className="text-red-500">*</span> <Badge variant="outline" className="ml-2">Submitted by client</Badge>
              </Label>
              <Input
                placeholder="e.g., Q1 Enterprise Outreach"
                className="max-w-lg"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-medium">
                Campaign Objective <span className="text-red-500">*</span> <Badge variant="outline" className="ml-2">Submitted by client</Badge>
              </Label>
              <Textarea
                placeholder="e.g., Generate qualified leads for our new SaaS product among enterprise IT decision-makers..."
                className="max-w-lg"
                value={form.objective}
                onChange={(e) => setForm((prev) => ({ ...prev, objective: e.target.value }))}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Describe what you want this campaign to accomplish</p>
            </div>
            <div className="space-y-2">
              <Label className="font-medium">
                Additional Description <span className="text-muted-foreground text-xs">(optional)</span> <Badge variant="outline" className="ml-2">Submitted by client</Badge>
              </Label>
              <Textarea
                placeholder="Any additional context about this campaign..."
                className="max-w-lg"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Ownership Linkage</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-selected from client, project, and work order context when available. You can still override the linkage.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="font-medium">
                    Organization <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={selectedClientAccountId || "__none"}
                    onValueChange={(value) => {
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {clientAccounts.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium">Project</Label>
                  <Select
                    value={selectedProjectId || "__none"}
                    onValueChange={(value) => {
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
                    <SelectTrigger>
                      <SelectValue placeholder={clientProjectsLoading ? "Loading projects..." : "Select project"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {clientProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium">Work Order</Label>
                  <Select
                    value={selectedWorkOrderId || "__none"}
                    onValueChange={(value) => {
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select work order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {filteredWorkOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {(order.title || `Order ${order.id.slice(0, 8)}`)} ({order.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
                {!!projectRequest?.name && (
                  <p className="text-xs text-muted-foreground">
                    Linked request: <span className="font-medium text-foreground">{projectRequest.name}</span>
                  </p>
                )}
                {!!selectedProject?.description && (
                  <p className="text-xs text-muted-foreground">
                    Project context: <span className="text-foreground">{selectedProject.description}</span>
                  </p>
                )}
                {!!relatedOrder?.description && (
                  <p className="text-xs text-muted-foreground">
                    Order context: <span className="text-foreground">{relatedOrder.description}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Email Routing</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose the sender identity and reply inbox used for test sends, launch, and delivery reporting.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-medium">
                    Sender <span className="text-red-500">*</span>
                  </Label>
                  {senderProfilesLoading ? (
                    <div className="flex h-10 items-center justify-center rounded-md border">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Select
                      value={selectedSenderProfileId || "__none"}
                      onValueChange={(value) => {
                        const nextSenderId = value === "__none" ? "" : value;
                        setSelectedSenderProfileId(nextSenderId);
                        const nextSender = senderProfiles.find((sender) => sender.id === nextSenderId);
                        if (nextSender) {
                          setReplyToEmail(nextSender.replyToEmail || nextSender.replyTo || nextSender.fromEmail || "");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sender profile" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No sender selected</SelectItem>
                        {senderProfiles.map((sender) => (
                          <SelectItem key={sender.id} value={sender.id}>
                            {firstNonEmptyString(sender.fromName, sender.name)} &lt;{sender.fromEmail}&gt;
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="font-medium">
                    Reply-To Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="replies@yourdomain.com"
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value)}
                    className={replyToEmail && !isValidEmail(replyToEmail) ? "border-red-300" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Replies should route to the monitored campaign inbox.
                  </p>
                </div>
              </div>

              {selectedSender && (
                <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
                  <p className="text-sm font-medium">
                    {firstNonEmptyString(selectedSender.fromName, selectedSender.name)} &lt;{selectedSender.fromEmail}&gt;
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Provider: {selectedSender.campaignProvider?.name || selectedSender.campaignProvider?.providerKey || "Default routing"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reply-To: {replyToEmail || selectedSender.replyToEmail || selectedSender.replyTo || selectedSender.fromEmail}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>
              All fields below are <strong>optional</strong>. Fill in what you can. Client-submitted values are editable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Organization Intelligence</h3>
                    <p className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                      Automatically populate campaign details from the organization profile.
                    </p>
                    {!organizationIntelligence?.organization && (
                      <p className="text-blue-700/80 dark:text-blue-300/80 text-xs mt-1">
                        No org profile found for the selected organization.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={orgAutofillLoading || !organizationIntelligence?.organization}
                  onClick={runOrgAutofill}
                  className="flex-shrink-0 border-blue-200 hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900"
                >
                  {orgAutofillLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Populate
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="font-medium flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Target Audience <Badge variant="outline" className="ml-2">Submitted by client</Badge>
                  </Label>
                  <Textarea
                    placeholder="e.g., VP/Director of IT at mid-market SaaS companies (500-2000 employees)"
                    value={form.targetAudience}
                    onChange={(e) => setForm((prev) => ({ ...prev, targetAudience: e.target.value }))}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Target Industries <Badge variant="outline" className="ml-2">Submitted by client</Badge>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Technology"
                      value={industryInput}
                      onChange={(e) => setIndustryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addArrayItem("targetIndustries", industryInput, () => setIndustryInput(""));
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem("targetIndustries", industryInput, () => setIndustryInput(""))}>Add</Button>
                  </div>
                  {form.targetIndustries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {form.targetIndustries.map((industry) => (
                        <Badge key={industry} variant="secondary" className="gap-1">
                          {industry}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => removeArrayItem("targetIndustries", industry)} />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="font-medium flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Target Job Titles <Badge variant="outline" className="ml-2">Submitted by client</Badge>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., CTO, VP Engineering"
                      value={jobTitleInput}
                      onChange={(e) => setJobTitleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addArrayItem("targetJobTitles", jobTitleInput, () => setJobTitleInput(""));
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem("targetJobTitles", jobTitleInput, () => setJobTitleInput(""))}>Add</Button>
                  </div>
                  {form.targetJobTitles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {form.targetJobTitles.map((title) => (
                        <Badge key={title} variant="secondary" className="gap-1">
                          {title}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => removeArrayItem("targetJobTitles", title)} />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="font-medium">
                    Success Criteria <Badge variant="outline" className="ml-2">Submitted by client</Badge>
                  </Label>
                  <Textarea
                    placeholder="e.g., 50+ qualified meetings booked, 15% response rate..."
                    value={form.successCriteria}
                    onChange={(e) => setForm((prev) => ({ ...prev, successCriteria: e.target.value }))}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-medium flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" /> Landing Page URL <Badge variant="outline" className="ml-2">Submitted by client</Badge>
                  </Label>
                  <Input
                    placeholder="https://yourcompany.com/landing-page"
                    value={form.landingPageUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, landingPageUrl: e.target.value }))}
                    className="max-w-lg"
                  />
                  <p className="text-xs text-muted-foreground">Where prospects should be directed after engagement</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Audience (Admin Only)</CardTitle>
            <CardDescription>
              Choose audience source using the same pattern as call campaigns. Static lists support row-level include/exclude.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Audience Source</h3>
                <p className="text-xs text-muted-foreground mt-1">Select Segment or Static List before reviewing this campaign.</p>
              </div>
              <RadioGroup
                value={selectedAudienceSource}
                onValueChange={(value) => {
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
                <Label
                  htmlFor="audience-source-segment"
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    selectedAudienceSource === "segment" ? "border-primary bg-primary/5" : "hover:border-primary/30"
                  )}
                >
                  <RadioGroupItem id="audience-source-segment" value="segment" className="sr-only" />
                  <Users className={cn("h-4 w-4", selectedAudienceSource === "segment" ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <p className="text-sm font-medium">Segment</p>
                    <p className="text-xs text-muted-foreground">Use dynamic audience segment</p>
                  </div>
                </Label>
                <Label
                  htmlFor="audience-source-list"
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    selectedAudienceSource === "list" ? "border-primary bg-primary/5" : "hover:border-primary/30"
                  )}
                >
                  <RadioGroupItem id="audience-source-list" value="list" className="sr-only" />
                  <FileText className={cn("h-4 w-4", selectedAudienceSource === "list" ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <p className="text-sm font-medium">Static List</p>
                    <p className="text-xs text-muted-foreground">Choose uploaded contact list and refine contacts</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {selectedAudienceSource === "segment" && (
              <div className="rounded-lg border p-4 space-y-3">
                <Label className="font-medium">Segment</Label>
                <Select
                  value={selectedSegmentId || "__none"}
                  onValueChange={(value) => setSelectedSegmentId(value === "__none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select segment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select segment</SelectItem>
                    {contactSegments.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id}>
                        {segment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Estimated contacts: {segmentAudienceCount.toLocaleString()}</Badge>
                  {selectedSegment && <Badge variant="secondary">Selected: {selectedSegment.name}</Badge>}
                </div>
              </div>
            )}

            {selectedAudienceSource === "list" && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="font-medium">Static List</Label>
                  <Select
                    value={selectedListId || "__none"}
                    onValueChange={(value) => {
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select static list" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Select static list</SelectItem>
                      {contactLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!!selectedListId && (
                  <>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <Input
                        placeholder="Search contacts by name, email, company, title..."
                        value={listSearchQuery}
                        onChange={(e) => setListSearchQuery(e.target.value)}
                        className="max-w-lg"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setSelectionForIds(pageContactIds, !allPageSelected)}>
                          {allPageSelected ? "Unselect page" : "Select all page"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSelectionForIds(
                              filteredListMembers.map((member) => member.id).filter((id): id is string => typeof id === "string" && id.length > 0),
                              !allFilteredSelected
                            )
                          }
                        >
                          {allFilteredSelected ? "Unselect filtered" : "Select all filtered"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={selectedCount === 0} onClick={() => setContactsIncluded(selectedContactIds, true)}>
                          Include selected
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={selectedCount === 0} onClick={() => setContactsIncluded(selectedContactIds, false)}>
                          Exclude selected
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={selectedCount === 0} onClick={clearContactSelection}>
                          Clear selection
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">Total: {staticListTotalCount.toLocaleString()}</Badge>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Included: {staticListIncludedCount.toLocaleString()}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Excluded: {staticListExcludedCount.toLocaleString()}</Badge>
                      {selectedCount > 0 && <Badge variant="secondary">Selected rows: {selectedCount}</Badge>}
                    </div>

                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[60px]">Select</TableHead>
                            <TableHead className="w-[72px]">Include</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Company</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listMembersLoading ? (
                            <TableRow>
                              <TableCell colSpan={7}>
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Loading list contacts...
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : pagedListMembers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                No contacts found for this list/filter.
                              </TableCell>
                            </TableRow>
                          ) : (
                            pagedListMembers.map((member) => {
                              const contactId = member.id;
                              const included = isContactIncluded(contactId);
                              return (
                                <TableRow key={contactId}>
                                  <TableCell>
                                    <Checkbox
                                      checked={!!contactSelection[contactId]}
                                      onCheckedChange={(checked) => toggleContactSelection(contactId, !!checked)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Checkbox
                                      checked={included}
                                      onCheckedChange={(checked) => setContactsIncluded([contactId], !!checked)}
                                    />
                                  </TableCell>
                                  <TableCell className="text-xs">{getMemberDisplayName(member)}</TableCell>
                                  <TableCell className="text-xs">{member.email || "-"}</TableCell>
                                  <TableCell className="text-xs">{member.accountName || member.account?.name || "-"}</TableCell>
                                  <TableCell className="text-xs">{member.jobTitle || "-"}</TableCell>
                                  <TableCell>
                                    {included ? (
                                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Included</Badge>
                                    ) : (
                                      <Badge variant="secondary">Excluded</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <p>
                        Showing {(activePage - 1) * pageSize + (pagedListMembers.length > 0 ? 1 : 0)}-
                        {(activePage - 1) * pageSize + pagedListMembers.length} of {filteredListMembers.length} filtered contact(s)
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={activePage <= 1}
                          onClick={() => setListPage((prev) => Math.max(prev - 1, 1))}
                        >
                          Prev
                        </Button>
                        <span>
                          Page {activePage} of {totalPages}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={activePage >= totalPages}
                          onClick={() => setListPage((prev) => Math.min(prev + 1, totalPages))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Email Template</CardTitle>
            <CardDescription>
              Reuse the admin email preview style to finalize subject, body, tone, and design before review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="font-medium">Tone</Label>
                <Select
                  value={templateTone}
                  onValueChange={(value) => void applyGeneratedTemplate(value as TemplateTone, templateDesign)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-medium">Design</Label>
                <Select
                  value={templateDesign}
                  onValueChange={(value) => void applyGeneratedTemplate(templateTone, value as TemplateDesign)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select design" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">Plain</SelectItem>
                    <SelectItem value="branded">Branded</SelectItem>
                    <SelectItem value="newsletter">Newsletter</SelectItem>
                    <SelectItem value="argyle-brand">Argyle Brand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void applyGeneratedTemplate(templateTone, templateDesign)}
                >
                  Regenerate from Tone + Design
                </Button>
              </div>
            </div>

            {templateDesign === "argyle-brand" && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                Using Argyle palette
                {" "}
                ({brandPaletteResponse?.palette?.source === "website-css" ? "auto-detected from argyleforum.com CSS" : "fallback defaults"}).
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-medium">Subject Line</Label>
              <Input
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
                placeholder="Write a clear subject line..."
              />
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Preheader</Label>
              <Input
                value={templatePreheader}
                onChange={(e) => setTemplatePreheader(e.target.value)}
                placeholder="Add short preview text shown after the subject..."
              />
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Email Body (Text Fallback)</Label>
              <Textarea
                value={templateBodyText}
                onChange={(e) => setTemplateBodyText(e.target.value)}
                rows={8}
                placeholder="Write the email body. HTML preview updates automatically."
              />
              <p className="text-xs text-muted-foreground">
                HTML preview is generated from this body text and selected design.
              </p>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Supported Personalization Tokens</p>
                  <p className="text-xs text-muted-foreground">
                    Preview sample: {templateSampleContact.firstName} {templateSampleContact.lastName} ({templateSampleContact.company})
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowTemplatePreviewModal(true)}>
                  Open Full Preview
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasLandingPageUrl}
                  title={hasLandingPageUrl ? "Open landing page in new tab" : "No landing page URL provided."}
                  onClick={() => {
                    if (!hasLandingPageUrl) return;
                    window.open(landingPageUrlForTemplate, "_blank", "noopener,noreferrer");
                  }}
                >
                  View brief
                </Button>
                {!hasLandingPageUrl && (
                  <span className="text-xs text-muted-foreground">No landing page URL provided.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_PERSONALIZATION_TOKENS.map((token) => (
                  <Badge key={token} variant="secondary">
                    {token}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-md border p-4 space-y-2">
                <p className="text-xs text-muted-foreground">Rendered Subject</p>
                <p className="font-medium">{templateRenderedSubject || "-"}</p>
                <p className="text-xs text-muted-foreground pt-2">Rendered Preheader</p>
                <p className="text-sm">{templateRenderedPreheader || "-"}</p>
                <p className="text-xs text-muted-foreground pt-2">Rendered Text Fallback</p>
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap text-xs rounded bg-muted/30 p-3">
                  {templateRenderedBodyText || "-"}
                </pre>
              </div>
              <div className="rounded-md border p-4 space-y-2">
                <p className="text-xs text-muted-foreground">HTML Preview</p>
                <div className="h-[360px] overflow-hidden rounded border bg-muted/20">
                  <iframe
                    title="Email Template Preview"
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta charset="UTF-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                          <style>
                            body { margin: 0; padding: 16px; background: #f8fafc; }
                            img { max-width: 100%; height: auto; }
                          </style>
                        </head>
                        <body>${sanitizeHtmlForIframePreview(templateRenderedHtmlWithTargets)}</body>
                      </html>
                    `}
                    className="h-full w-full border-0"
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Send</CardTitle>
            <CardDescription>
              Add test recipients using the same contact column format, then send the current template and review per-row delivery results.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Rows: {testSendStatusCounts.total}</Badge>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Sent: {testSendStatusCounts.sent}</Badge>
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Failed: {testSendStatusCounts.failed}</Badge>
                {testSendStatusCounts.invalid > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Invalid: {testSendStatusCounts.invalid}</Badge>
                )}
                {testSendSummary.lastAttemptAt && (
                  <Badge variant="secondary">
                    Last test: {new Date(testSendSummary.lastAttemptAt).toLocaleString()}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addTestSendRow}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Row
                </Button>
                <Button type="button" size="sm" onClick={() => void sendTestEmails()} disabled={isSendingTests || !templateReady}>
                  {isSendingTests ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  Send Test
                </Button>
              </div>
            </div>

            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>first_name</TableHead>
                    <TableHead>last_name</TableHead>
                    <TableHead>email</TableHead>
                    <TableHead>company</TableHead>
                    <TableHead>job_title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[72px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testSendRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No test rows yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    testSendRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Input
                            value={row.first_name}
                            onChange={(e) => updateTestSendRow(row.id, "first_name", e.target.value)}
                            placeholder="Alex"
                            disabled={isSendingTests}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.last_name}
                            onChange={(e) => updateTestSendRow(row.id, "last_name", e.target.value)}
                            placeholder="Taylor"
                            disabled={isSendingTests}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.email}
                            onChange={(e) => updateTestSendRow(row.id, "email", e.target.value)}
                            placeholder="alex@example.com"
                            disabled={isSendingTests}
                            className={row.status === "invalid" || row.status === "failed" ? "border-red-300" : ""}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.company}
                            onChange={(e) => updateTestSendRow(row.id, "company", e.target.value)}
                            placeholder="Acme"
                            disabled={isSendingTests}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.job_title}
                            onChange={(e) => updateTestSendRow(row.id, "job_title", e.target.value)}
                            placeholder="Director"
                            disabled={isSendingTests}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {row.status === "sent" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">sent</Badge>}
                            {row.status === "failed" && <Badge className="bg-red-100 text-red-700 hover:bg-red-100">failed</Badge>}
                            {row.status === "invalid" && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">invalid</Badge>}
                            {row.status === "sending" && <Badge variant="secondary">sending...</Badge>}
                            {row.status === "idle" && <Badge variant="outline">pending</Badge>}
                            {row.message && <p className="text-[11px] text-muted-foreground">{row.message}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTestSendRow(row.id)}
                            disabled={isSendingTests}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Confirm campaign fields and audience selection before saving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Channel</p>
                <p className="font-medium">{form.channel === "combo" ? "Phone + Email" : "Email"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Campaign Name</p>
                <p className="font-medium">{form.name}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Sender</p>
                <p className="font-medium">
                  {selectedSender
                    ? `${firstNonEmptyString(selectedSender.fromName, selectedSender.name)} <${selectedSender.fromEmail}>`
                    : "-"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedSender?.campaignProvider?.name || selectedSender?.campaignProvider?.providerKey || "Default routing"}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Reply-To</p>
                <p className="font-medium">{replyToEmail || "-"}</p>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Objective</p>
                <p className="font-medium whitespace-pre-wrap">{form.objective || "-"}</p>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Additional Description</p>
                <p className="whitespace-pre-wrap">{form.description || "-"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Target Audience</p>
                <p>{form.targetAudience || "-"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Success Criteria</p>
                <p>{form.successCriteria || "-"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Target Job Titles</p>
                <p>{form.targetJobTitles.length > 0 ? form.targetJobTitles.join(", ") : "-"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Target Industries</p>
                <p>{form.targetIndustries.length > 0 ? form.targetIndustries.join(", ") : "-"}</p>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Landing Page URL</p>
                <p className="break-all">{form.landingPageUrl || "-"}</p>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Audience Source</p>
                <p className="font-medium">
                  {selectedAudienceSource === "segment" ? "Segment" : "Static List"}:{" "}
                  {selectedAudienceSource === "segment" ? selectedSegment?.name || "-" : selectedList?.name || "-"}
                </p>
                {selectedAudienceSource === "segment" ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Estimated contacts: {segmentAudienceCount.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Total: {staticListTotalCount.toLocaleString()} | Included: {staticListIncludedCount.toLocaleString()} | Excluded: {staticListExcludedCount.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Email Template</p>
                <p className="font-medium">
                  Tone: {templateTone[0].toUpperCase() + templateTone.slice(1)} | Design: {getTemplateDesignLabel(templateDesign)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Subject</p>
                <p className="font-medium">{templateSubject || "-"}</p>
                <p className="mt-2 text-xs text-muted-foreground">Preheader</p>
                <p className="font-medium">{templatePreheader || "-"}</p>
                <p className="mt-2 text-xs text-muted-foreground">Body (text fallback)</p>
                <p className="whitespace-pre-wrap">{templateBodyText || "-"}</p>
                <p className="mt-2 text-xs text-muted-foreground">Supported tokens</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SUPPORTED_PERSONALIZATION_TOKENS.map((token) => (
                    <Badge key={token} variant="secondary">
                      {token}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Test Send</p>
                <p className="font-medium">
                  Rows: {testSendStatusCounts.total} | Sent: {testSendStatusCounts.sent} | Failed: {testSendStatusCounts.failed}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {testSendSummary.lastAttemptAt
                    ? `Last attempted: ${new Date(testSendSummary.lastAttemptAt).toLocaleString()}`
                    : "No test send attempted yet."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAutofillDialog} onOpenChange={setShowAutofillDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply Organization Intelligence Replacements</DialogTitle>
            <DialogDescription>
              Empty fields were already filled automatically. Select any existing values you want to replace with suggestions.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-auto space-y-3 pr-1">
            {autofillCandidates.map((candidate) => {
              const currentValue = Array.isArray(candidate.currentValue)
                ? candidate.currentValue.join(", ")
                : candidate.currentValue;
              const suggestedValue = Array.isArray(candidate.suggestedValue)
                ? candidate.suggestedValue.join(", ")
                : candidate.suggestedValue;

              return (
                <div key={candidate.key} className="rounded-md border p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={autofillSelections[candidate.key]}
                      onCheckedChange={(checked) =>
                        setAutofillSelections((prev) => ({ ...prev, [candidate.key]: !!checked }))
                      }
                    />
                    <div className="space-y-2 flex-1 min-w-0">
                      <p className="text-sm font-medium">{candidate.label}</p>
                      <div className="rounded bg-muted/40 p-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current</p>
                        <p className="text-xs whitespace-pre-wrap break-words">{currentValue || "-"}</p>
                      </div>
                      <div className="rounded bg-primary/5 p-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Suggested</p>
                        <p className="text-xs whitespace-pre-wrap break-words">{suggestedValue || "-"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutofillDialog(false)}>Cancel</Button>
            <Button onClick={applySelectedAutofillReplacements}>Apply Selected</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailPreview
        open={showTemplatePreviewModal}
        onOpenChange={setShowTemplatePreviewModal}
        htmlContent={templateRenderedHtmlWithTargets}
        subject={templateRenderedSubject || templateSubject || "Untitled email"}
        preheader={templateRenderedPreheader || templateRenderedBodyText.split("\n")[0] || ""}
        fromName={firstNonEmptyString(selectedSender?.fromName, selectedSender?.name, templateOrganizationName)}
        fromEmail={selectedSender?.fromEmail || "campaigns@demandgentic.local"}
        sampleContacts={previewContacts}
      />

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0 || isSaving} onClick={() => setStep((prev) => Math.max(prev - 1, 0))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button disabled={!canProceed || isSaving} onClick={() => setStep((prev) => Math.min(prev + 1, STEPS.length - 1))}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={isSaving || !audienceReady || !templateReady} onClick={() => void handleSave()}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {primarySaveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
