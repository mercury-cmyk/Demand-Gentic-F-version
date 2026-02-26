import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { parseCSV, csvRowToContact, csvRowToAccount, csvRowToContactFromUnified, csvRowToAccountFromUnified } from "@/lib/csv-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  X,
  Target,
  Users,
  Upload,
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
}

interface ProjectRequestRecord {
  id: string;
  name: string;
  clientAccountId?: string | null;
  description: string | null;
  landingPageUrl: string | null;
  requestedLeadCount: number | null;
  externalEventId: string | null;
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

interface AudienceRow {
  id: number;
  email: string;
  fullName: string;
  companyName: string;
  title: string;
  include: boolean;
  errors: string[];
  contact: any;
  account: any;
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

const STEPS = [
  { id: "channel", label: "Channel", icon: Sparkles },
  { id: "basics", label: "Basics", icon: FileText },
  { id: "details", label: "Details", icon: Target },
  { id: "audience", label: "Audience", icon: Users },
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

function getRouteCampaignId(): string | null {
  const match = window.location.pathname.match(/\/([^/]+)\/edit$/);
  return match?.[1] || null;
}

export default function SimpleEmailCampaignEditPage() {
  const [, paramsA] = useRoute("/campaigns/email/:id/edit");
  const [, paramsB] = useRoute("/simple-email-campaigns/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const campaignId = paramsA?.id || paramsB?.id || getRouteCampaignId();

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

  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [audienceRows, setAudienceRows] = useState<AudienceRow[]>([]);
  const [createdListId, setCreatedListId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{ created: number; updated: number; failed: number } | null>(null);
  const [selectedClientAccountId, setSelectedClientAccountId] = useState<string>("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string>("");

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

  const { data: adminOrders } = useQuery<AdminOrderRow[]>({
    queryKey: ["admin-email-campaign-orders"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/orders");
      return res.json();
    },
    staleTime: 60_000,
  });

  const relatedOrder = useMemo(() => {
    if (!campaign || !adminOrders?.length) return null;
    const candidates = adminOrders.filter((row) => {
      if (campaign.projectId && row.order.projectId === campaign.projectId) return true;
      if (row.order.campaignId && row.order.campaignId === campaign.id) return true;
      return false;
    });
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      return new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime();
    })[0].order;
  }, [campaign, adminOrders]);

  const filteredWorkOrders = useMemo(() => {
    if (!adminOrders?.length) return [];
    const orders = adminOrders.map((row) => row.order);
    if (!selectedClientAccountId) return orders;
    return orders.filter((order) => order.clientAccountId === selectedClientAccountId);
  }, [adminOrders, selectedClientAccountId]);

  const selectedWorkOrder = useMemo(() => {
    if (!selectedWorkOrderId || !adminOrders?.length) return null;
    const match = adminOrders.find((row) => row.order.id === selectedWorkOrderId);
    return match?.order || null;
  }, [adminOrders, selectedWorkOrderId]);

  const effectiveProjectId =
    selectedWorkOrder?.projectId ||
    (selectedClientAccountId && campaign?.clientAccountId && selectedClientAccountId !== campaign.clientAccountId
      ? null
      : campaign?.projectId || null);
  const effectiveOrgClientAccountId =
    selectedClientAccountId || selectedWorkOrder?.clientAccountId || campaign?.clientAccountId || relatedOrder?.clientAccountId || null;

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

  const existingAudienceListIds = useMemo(() => {
    const refs = (campaign?.audienceRefs || {}) as any;
    const ids = [
      ...(Array.isArray(refs.lists) ? refs.lists : []),
      ...(Array.isArray(refs.selectedLists) ? refs.selectedLists : []),
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    return Array.from(new Set(ids));
  }, [campaign?.audienceRefs]);

  const { data: existingListCounts = [] } = useQuery<number[]>({
    queryKey: ["admin-email-campaign-audience-counts", existingAudienceListIds],
    enabled: existingAudienceListIds.length > 0,
    queryFn: async () => {
      const responses = await Promise.all(
        existingAudienceListIds.map(async (listId) => {
          try {
            const res = await apiRequest("GET", `/api/lists/${listId}/count`);
            const body = await res.json();
            return Number(body?.count || 0);
          } catch {
            return 0;
          }
        })
      );
      return responses;
    },
  });

  const existingAudienceCount = useMemo(() => existingListCounts.reduce((sum, c) => sum + c, 0), [existingListCounts]);

  const clientSnapshot = useMemo(() => {
    const wizardDetails = (campaign?.audienceRefs as any)?.wizardDetails || {};
    const targetTitlesFromOrder = normalizeTextArray(relatedOrder?.targetTitles);
    const targetIndustriesFromOrder = normalizeTextArray(relatedOrder?.targetIndustries);

    const campaignConfig = (relatedOrder?.campaignConfig || {}) as any;

    return {
      name: campaign?.name || "",
      objective:
        campaign?.campaignObjective ||
        campaignConfig.objective ||
        "",
      description:
        campaign?.productServiceInfo ||
        relatedOrder?.description ||
        projectRequest?.description ||
        "",
      targetAudience:
        campaign?.targetAudienceDescription ||
        campaignConfig.targetAudience ||
        "",
      successCriteria:
        campaign?.successCriteria ||
        campaignConfig.successCriteria ||
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
  }, [campaign, relatedOrder, projectRequest]);

  useEffect(() => {
    if (!campaign || initialized) return;

    const normalizedType = campaign.type === "combo" ? "combo" : "email";

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
    const inferredClientAccountId =
      campaign.clientAccountId ||
      relatedOrder?.clientAccountId ||
      "";
    const inferredWorkOrderId = relatedOrder?.id || "";
    setSelectedClientAccountId(inferredClientAccountId);
    setSelectedWorkOrderId(inferredWorkOrderId);
    setInitialized(true);
  }, [campaign, initialized, clientSnapshot, relatedOrder]);

  const includedCount = audienceRows.filter((row) => row.include).length;
  const excludedCount = audienceRows.length - includedCount;
  const audienceReady = includedCount > 0 || existingAudienceCount > 0 || !!createdListId;

  const canProceed = useMemo(() => {
    if (step === 0) return !!form.channel;
    if (step === 1) return form.name.trim().length > 0 && form.objective.trim().length > 0;
    if (step === 2) return true;
    if (step === 3) return audienceReady;
    return true;
  }, [step, form, audienceReady]);

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

  const handleAudienceFile = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        toast({ title: "CSV is empty", description: "Upload a CSV with headers and at least one row.", variant: "destructive" });
        return;
      }

      const headers = rows[0].map((header) => String(header || "").trim());
      const dataRows = rows.slice(1);
      const hasAccountPrefix = headers.some((header) => header.toLowerCase().startsWith("account_"));

      const parsedRows: AudienceRow[] = dataRows.map((row, index) => {
        const contactRaw = hasAccountPrefix
          ? csvRowToContactFromUnified(row, headers)
          : csvRowToContact(row, headers);
        const accountRaw = hasAccountPrefix
          ? csvRowToAccountFromUnified(row, headers)
          : csvRowToAccount(row, headers);

        const email = typeof contactRaw.email === "string" ? contactRaw.email.trim() : "";
        const firstName = typeof contactRaw.firstName === "string" ? contactRaw.firstName.trim() : "";
        const lastName = typeof contactRaw.lastName === "string" ? contactRaw.lastName.trim() : "";
        const inferredName = [firstName, lastName].filter(Boolean).join(" ").trim();
        const fullName =
          (typeof contactRaw.fullName === "string" ? contactRaw.fullName.trim() : "") ||
          inferredName ||
          (email ? email.split("@")[0] : "");

        const errors: string[] = [];
        if (!email) errors.push("Missing email");

        return {
          id: index,
          email,
          fullName,
          companyName: typeof accountRaw.name === "string" ? accountRaw.name : "",
          title: typeof contactRaw.jobTitle === "string" ? contactRaw.jobTitle : "",
          include: errors.length === 0,
          errors,
          contact: {
            ...contactRaw,
            email,
            fullName,
            firstName,
            lastName,
          },
          account: accountRaw,
        };
      });

      setUploadedFileName(file.name);
      setAudienceRows(parsedRows);
      setImportSummary(null);
      setCreatedListId(null);

      const invalidRows = parsedRows.filter((row) => row.errors.length > 0).length;
      toast({
        title: "CSV parsed",
        description:
          invalidRows > 0
            ? `${parsedRows.length} rows loaded (${invalidRows} row(s) excluded by default).`
            : `${parsedRows.length} rows loaded and ready for import.`,
      });
    } catch (error: any) {
      toast({ title: "Failed to parse CSV", description: error?.message || "Invalid CSV format", variant: "destructive" });
    }
  };

  const setAllAudienceRows = (include: boolean) => {
    setAudienceRows((prev) =>
      prev.map((row) => ({
        ...row,
        include: row.errors.length === 0 ? include : false,
      }))
    );
  };

  const updateAudienceRow = (rowId: number, include: boolean) => {
    setAudienceRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId || row.errors.length > 0) return row;
        return { ...row, include };
      })
    );
  };

  const importAudienceToList = async () => {
    const rowsToImport = audienceRows.filter((row) => row.include);
    if (rowsToImport.length === 0) {
      return { listId: createdListId, summary: null };
    }

    let listId = createdListId;

    if (!listId) {
      const listResponse = await apiRequest("POST", "/api/lists", {
        name: `${form.name || campaign?.name || "Email Campaign"} - Admin Upload`,
        description: `Uploaded from admin email edit wizard (${new Date().toISOString()})`,
        entityType: "contact",
        sourceType: "manual_upload",
      });
      const list = await listResponse.json();
      listId = list.id;
      setCreatedListId(list.id);
    }

    const records = rowsToImport.map((row) => ({
      contact: {
        ...row.contact,
        fullName: row.fullName,
        email: row.email,
      },
      account: {
        ...row.account,
      },
    }));

    const importResponse = await apiRequest("POST", "/api/contacts/batch-import", {
      listId,
      records,
    });

    const importResult = await importResponse.json();
    const summary = {
      created: Number(importResult?.created || 0),
      updated: Number(importResult?.updated || 0),
      failed: Number(importResult?.failed || 0),
    };

    setImportSummary(summary);
    return { listId, summary };
  };

  const handleSave = async () => {
    if (!campaignId || !campaign) return;

    try {
      setIsSaving(true);

      let uploadedListId = createdListId;
      let latestImportSummary: { created: number; updated: number; failed: number } | null = null;
      if (includedCount > 0) {
        const importResult = await importAudienceToList();
        uploadedListId = importResult.listId || uploadedListId;
        latestImportSummary = importResult.summary;
      }

      const existingRefs = (campaign.audienceRefs || {}) as any;
      const currentListIds = [
        ...(Array.isArray(existingRefs.lists) ? existingRefs.lists : []),
        ...(Array.isArray(existingRefs.selectedLists) ? existingRefs.selectedLists : []),
      ].filter((id): id is string => typeof id === "string" && id.length > 0);

      const mergedListIds = Array.from(new Set([...(currentListIds || []), ...(uploadedListId ? [uploadedListId] : [])]));
      const linkageProjectId =
        selectedWorkOrder?.projectId ||
        (selectedClientAccountId && campaign.clientAccountId === selectedClientAccountId ? campaign.projectId : null);

      const patchPayload = {
        type: form.channel === "combo" ? "combo" : "email",
        enabledChannels: form.channel === "combo" ? ["email", "voice"] : ["email"],
        ...(selectedClientAccountId && linkageProjectId
          ? { clientAccountId: selectedClientAccountId, projectId: linkageProjectId }
          : {}),
        name: form.name.trim(),
        campaignObjective: form.objective.trim(),
        productServiceInfo: form.description.trim() || null,
        targetAudienceDescription: form.targetAudience.trim() || null,
        successCriteria: form.successCriteria.trim() || null,
        landingPageUrl: form.landingPageUrl.trim() || null,
        audienceRefs: {
          ...existingRefs,
          lists: mergedListIds,
          selectedLists: mergedListIds,
          wizardDetails: {
            ...(existingRefs.wizardDetails || {}),
            targetJobTitles: form.targetJobTitles,
            targetIndustries: form.targetIndustries,
            uploadedFromAdminWizard: true,
            setupCompletedAt: new Date().toISOString(),
            setupCompletedBy: "admin",
          },
        },
      };

      await apiRequest("PATCH", `/api/campaigns/${campaignId}`, patchPayload);

      toast({
        title: "Campaign setup saved",
        description:
          latestImportSummary && (latestImportSummary.created > 0 || latestImportSummary.updated > 0)
            ? `Campaign updated. Contacts imported: ${latestImportSummary.created} created, ${latestImportSummary.updated} updated.`
            : "Campaign updated successfully.",
      });

      setLocation("/campaigns?tab=email");
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message || "Failed to save campaign setup", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!campaignId) {
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

  if (campaignLoading || !initialized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (campaignError || !campaign) {
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Admin Email Campaign Setup</h1>
          <p className="text-sm text-muted-foreground">
            Replace generic edit with guided setup: Channel, Basics, Details, Audience, Review.
          </p>
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
          <div className="mt-4 grid grid-cols-5 gap-2 text-xs">
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
                  Auto-selected from the client submission. You can still override Organization and Work Order.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-medium">Organization</Label>
                  <Select
                    value={selectedClientAccountId || "__none"}
                    onValueChange={(value) => {
                      const nextOrg = value === "__none" ? "" : value;
                      setSelectedClientAccountId(nextOrg);
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

              {!!projectRequest?.name && (
                <p className="text-xs text-muted-foreground">
                  Linked request: <span className="font-medium text-foreground">{projectRequest.name}</span>
                </p>
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
              Upload contacts CSV, preview parsed rows, then include or exclude contacts before saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-dashed p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="audience-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Upload className="h-4 w-4" /> Upload CSV
                </Label>
                <Input
                  id="audience-upload"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAudienceFile(file);
                  }}
                />
                {uploadedFileName && <Badge variant="secondary">{uploadedFileName}</Badge>}
                {existingAudienceCount > 0 && (
                  <Badge variant="outline">Existing audience attached: {existingAudienceCount.toLocaleString()} contacts</Badge>
                )}
              </div>
            </div>

            {audienceRows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">Total rows: {audienceRows.length}</Badge>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Included: {includedCount}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Excluded: {excludedCount}</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllAudienceRows(true)}>Include All Valid</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllAudienceRows(false)}>Exclude All</Button>
                </div>

                <div className="max-h-[360px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[70px]">Include</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audienceRows.slice(0, 50).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Checkbox
                              checked={row.include}
                              disabled={row.errors.length > 0}
                              onCheckedChange={(checked) => updateAudienceRow(row.id, !!checked)}
                            />
                          </TableCell>
                          <TableCell className="text-xs">{row.email || "-"}</TableCell>
                          <TableCell className="text-xs">{row.fullName || "-"}</TableCell>
                          <TableCell className="text-xs">{row.companyName || "-"}</TableCell>
                          <TableCell className="text-xs">{row.title || "-"}</TableCell>
                          <TableCell>
                            {row.errors.length > 0 ? (
                              <Badge variant="destructive">{row.errors.join(", ")}</Badge>
                            ) : row.include ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Included</Badge>
                            ) : (
                              <Badge variant="secondary">Excluded</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {audienceRows.length > 50 && (
                  <p className="text-xs text-muted-foreground">Showing first 50 rows in preview. All rows are imported on save.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Confirm campaign fields and audience import summary before saving.</CardDescription>
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
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Existing audience</p>
                <p className="text-lg font-semibold">{existingAudienceCount.toLocaleString()}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">CSV included rows</p>
                <p className="text-lg font-semibold">{includedCount.toLocaleString()}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Will import now</p>
                <p className="text-lg font-semibold">{includedCount > 0 ? "Yes" : "No"}</p>
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
          <Button disabled={isSaving || !audienceReady} onClick={() => void handleSave()}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Save Setup
          </Button>
        )}
      </div>
    </div>
  );
}
