import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  FileText,
  Palette,
  Image,
  FormInput,
  Users,
  Star,
  Settings,
  X,
  Sparkles,
  AlertCircle,
  Mail,
  Download,
  Eye,
  Clock,
  Zap,
  ExternalLink,
  Link2,
} from "lucide-react";
import type { ContentPromotionPage } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "textarea" | "hidden";
  required: boolean;
  placeholder?: string;
  options?: string[];
  prefillParam?: string;
  halfWidth?: boolean;
}

interface StatItem {
  value: string;
  label: string;
  icon?: string;
}

interface TrustBadge {
  text: string;
  icon: string;
}

interface Testimonial {
  quote: string;
  authorName: string;
  authorTitle: string;
  authorCompany: string;
}

interface BenefitItem {
  icon: string;
  title: string;
  description: string;
}

interface FormData {
  title: string;
  slug: string;
  pageType: string;
  templateTheme: string;
  heroConfig: {
    headline: string;
    subHeadline: string;
    backgroundStyle: string;
    backgroundValue: string;
    badgeText?: string;
    badgeIcon?: string;
  };
  assetConfig: {
    title: string;
    description: string;
    assetType: string;
    fileUrl: string;
    thumbnailUrl?: string;
    fileSize?: string;
    pageCount?: number;
    readTime?: string;
  };
  brandingConfig: {
    primaryColor: string;
    accentColor: string;
    companyName: string;
    logoUrl?: string;
    textColor?: string;
  };
  formConfig: {
    fields: FormField[];
    submitButtonText: string;
    consentText?: string;
    consentRequired?: boolean;
    showProgressBar?: boolean;
  };
  socialProofConfig: {
    stats: StatItem[];
    trustBadges: TrustBadge[];
    testimonials: Testimonial[];
    companyLogos: Array<{ name: string; logoUrl: string }>;
  };
  benefitsConfig: {
    sectionTitle: string;
    sectionSubtitle?: string;
    items: BenefitItem[];
  };
  urgencyConfig: {
    enabled: boolean;
    type: "countdown" | "limited_quantity" | "social_proof_count";
    countdownEndDate?: string;
    quantityRemaining?: number;
    recentDownloadsCount?: number;
    messageTemplate?: string;
  };
  thankYouConfig: {
    headline: string;
    message: string;
    showDownloadButton: boolean;
    downloadButtonText: string;
    redirectUrl?: string;
    redirectDelay?: number;
    showSocialShare: boolean;
    additionalCta?: { text: string; url: string };
  };
  seoConfig: {
    metaTitle?: string;
    metaDescription?: string;
    noIndex?: boolean;
  };
  confirmationEmailConfig: {
    enabled: boolean;
    subject: string;
    headline: string;
    bodyText: string;
    downloadButtonText: string;
    footerText?: string;
    replyTo?: string;
  };
}

interface PageBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPage: ContentPromotionPage | null;
  onSuccess: () => void;
  // Context for AI generation
  campaignId?: string;
  projectId?: string;
  organizationId?: string;
  clientId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_TYPES = [
  { value: "gated_download", label: "Gated Download", description: "Form required to access content" },
  { value: "ungated_download", label: "Ungated Download", description: "Click to download with optional capture" },
  { value: "webinar_registration", label: "Webinar Registration", description: "Event sign-up page" },
  { value: "demo_request", label: "Demo Request", description: "Book a demo CTA" },
  { value: "confirmation", label: "Confirmation", description: "Post-submission page" },
];

const TEMPLATE_THEMES = [
  { value: "executive", label: "Executive", description: "Dark, sophisticated, enterprise", colors: ["#1a1a2e", "#16213e", "#0f3460"] },
  { value: "modern_gradient", label: "Modern Gradient", description: "Bold gradients, vibrant", colors: ["#667eea", "#764ba2", "#f093fb"] },
  { value: "clean_minimal", label: "Clean Minimal", description: "White space, elegant", colors: ["#ffffff", "#f8f9fa", "#e9ecef"] },
  { value: "bold_impact", label: "Bold Impact", description: "High contrast, urgency", colors: ["#ff6b6b", "#feca57", "#48dbfb"] },
  { value: "tech_forward", label: "Tech Forward", description: "Futuristic, geometric", colors: ["#00d2ff", "#3a7bd5", "#0a0e27"] },
  { value: "nature_organic", label: "Nature Organic", description: "Earthy tones, natural", colors: ["#2d6a4f", "#95d5b2", "#d8f3dc"] },
  { value: "corporate_trust", label: "Corporate Trust", description: "Navy & gold, professional", colors: ["#1b2a4a", "#2c5282", "#d4a846"] },
  { value: "sunset_warm", label: "Sunset Warm", description: "Warm gradients, inviting", colors: ["#f97316", "#ef4444", "#fbbf24"] },
  { value: "ocean_calm", label: "Ocean Calm", description: "Soothing blues & teals", colors: ["#0ea5e9", "#06b6d4", "#e0f2fe"] },
  { value: "neon_pop", label: "Neon Pop", description: "Electric, edgy, attention-grabbing", colors: ["#a855f7", "#ec4899", "#14b8a6"] },
];

const ASSET_TYPES = [
  { value: "whitepaper", label: "Whitepaper" },
  { value: "ebook", label: "eBook" },
  { value: "webinar", label: "Webinar" },
  { value: "case_study", label: "Case Study" },
  { value: "infographic", label: "Infographic" },
  { value: "video", label: "Video" },
  { value: "report", label: "Report" },
];

const FIELD_PRESETS: { label: string; field: FormField }[] = [
  { label: "First Name", field: { name: "firstName", label: "First Name", type: "text", required: true, placeholder: "John", halfWidth: true, prefillParam: "firstName" } },
  { label: "Last Name", field: { name: "lastName", label: "Last Name", type: "text", required: true, placeholder: "Smith", halfWidth: true, prefillParam: "lastName" } },
  { label: "Email", field: { name: "email", label: "Business Email", type: "email", required: true, placeholder: "john@company.com", prefillParam: "email" } },
  { label: "Company", field: { name: "company", label: "Company", type: "text", required: true, placeholder: "Acme Corp", prefillParam: "company" } },
  { label: "Job Title", field: { name: "jobTitle", label: "Job Title", type: "text", required: false, placeholder: "VP of Marketing", prefillParam: "jobTitle" } },
  { label: "Phone", field: { name: "phone", label: "Phone", type: "tel", required: false, placeholder: "+1 (555) 000-0000", prefillParam: "phone" } },
];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "select", label: "Select" },
  { value: "textarea", label: "Textarea" },
  { value: "hidden", label: "Hidden" },
];

function getDefaultFormData(): FormData {
  return {
    title: "",
    slug: "",
    pageType: "gated_download",
    templateTheme: "modern_gradient",
    heroConfig: {
      headline: "",
      subHeadline: "",
      backgroundStyle: "gradient",
      backgroundValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      badgeText: "Free Download",
    },
    assetConfig: {
      title: "",
      description: "",
      assetType: "whitepaper",
      fileUrl: "",
    },
    brandingConfig: {
      primaryColor: "#7c3aed",
      accentColor: "#3b82f6",
      companyName: "",
    },
    formConfig: {
      fields: [
        { name: "firstName", label: "First Name", type: "text", required: true, placeholder: "John", halfWidth: true, prefillParam: "firstName" },
        { name: "lastName", label: "Last Name", type: "text", required: true, placeholder: "Smith", halfWidth: true, prefillParam: "lastName" },
        { name: "email", label: "Business Email", type: "email", required: true, placeholder: "john@company.com", prefillParam: "email" },
        { name: "company", label: "Company", type: "text", required: true, placeholder: "Acme Corp", prefillParam: "company" },
        { name: "jobTitle", label: "Job Title", type: "text", required: false, placeholder: "VP of Marketing", prefillParam: "jobTitle" },
      ],
      submitButtonText: "Download Now",
      consentText: "I agree to receive relevant communications. You can unsubscribe at any time.",
      consentRequired: true,
      showProgressBar: true,
    },
    socialProofConfig: { stats: [], trustBadges: [], testimonials: [], companyLogos: [] },
    benefitsConfig: { sectionTitle: "What You'll Learn", items: [] },
    urgencyConfig: { enabled: false, type: "social_proof_count" as const },
    thankYouConfig: {
      headline: "Thank you for downloading!",
      message: "Your download should start automatically. You can also use the button below.",
      showDownloadButton: true,
      downloadButtonText: "Download Again",
      showSocialShare: true,
    },
    seoConfig: {},
    confirmationEmailConfig: {
      enabled: false,
      subject: "Your download is ready!",
      headline: "Thank you for downloading!",
      bodyText: "Here's your download link. You can access it anytime.",
      downloadButtonText: "Download Now",
    },
  };
}

function formDataFromPage(page: ContentPromotionPage): FormData {
  const hero = page.heroConfig as FormData["heroConfig"] | null;
  const asset = page.assetConfig as FormData["assetConfig"] | null;
  const branding = page.brandingConfig as FormData["brandingConfig"] | null;
  const form = page.formConfig as FormData["formConfig"] | null;
  const social = page.socialProofConfig as FormData["socialProofConfig"] | null;
  const benefits = page.benefitsConfig as FormData["benefitsConfig"] | null;
  const urgency = page.urgencyConfig as FormData["urgencyConfig"] | null;
  const thankYou = page.thankYouConfig as FormData["thankYouConfig"] | null;
  const seo = page.seoConfig as FormData["seoConfig"] | null;

  const defaults = getDefaultFormData();

  return {
    title: page.title ?? "",
    slug: page.slug ?? "",
    pageType: page.pageType ?? "gated_download",
    templateTheme: page.templateTheme ?? "modern_gradient",
    heroConfig: hero ?? defaults.heroConfig,
    assetConfig: asset ?? defaults.assetConfig,
    brandingConfig: branding ?? defaults.brandingConfig,
    formConfig: form ?? defaults.formConfig,
    socialProofConfig: {
      stats: social?.stats ?? [],
      trustBadges: social?.trustBadges ?? [],
      testimonials: social?.testimonials ?? [],
      companyLogos: (social as any)?.companyLogos ?? [],
    },
    benefitsConfig: benefits ?? defaults.benefitsConfig,
    urgencyConfig: urgency ? { ...defaults.urgencyConfig, ...urgency } : defaults.urgencyConfig,
    thankYouConfig: thankYou ?? defaults.thankYouConfig,
    seoConfig: seo ?? defaults.seoConfig,
    confirmationEmailConfig: (page as any).confirmationEmailConfig ?? defaults.confirmationEmailConfig,
  };
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------------------------------------------------------------------------
// Color swatch helper
// ---------------------------------------------------------------------------

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded border border-border shrink-0"
          style={{ backgroundColor: value || "transparent" }}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#7c3aed"
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PageBuilderDialog({
  open,
  onOpenChange,
  editingPage,
  onSuccess,
  campaignId,
  projectId,
  organizationId,
  clientId,
}: PageBuilderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("basics");
  const [formData, setFormData] = useState<FormData>(getDefaultFormData());

  const isEditing = !!editingPage;
  const effectiveCampaignId = campaignId || editingPage?.campaignId || undefined;
  const effectiveProjectId = projectId || editingPage?.projectId || undefined;
  const effectiveOrganizationId = organizationId || editingPage?.organizationId || undefined;
  const effectiveClientId = clientId || editingPage?.clientAccountId || undefined;
  const canGenerateWithAi = !!effectiveCampaignId || !!effectiveOrganizationId;

  // Reset form when dialog opens/closes or editingPage changes
  useEffect(() => {
    if (open) {
      if (editingPage) {
        setFormData(formDataFromPage(editingPage));
      } else {
        setFormData(getDefaultFormData());
      }
      setActiveTab("basics");
    }
  }, [open, editingPage]);

  // Auto-generate slug from title (only when creating, and only if slug hasn't been manually edited)
  const [selectedClientId, setSelectedClientId] = useState<string>(clientId || "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  useEffect(() => {
    if (!isEditing && !slugManuallyEdited && formData.title) {
      setFormData((prev) => ({ ...prev, slug: generateSlug(prev.title) }));
    }
  }, [formData.title, isEditing, slugManuallyEdited]);

  // Reset manual slug flag and client selection when dialog opens
  useEffect(() => {
    if (open) {
      setSlugManuallyEdited(false);
      setSelectedClientId(editingPage?.clientAccountId ?? clientId ?? "");
    }
  }, [open, editingPage, clientId]);

  // Fetch client accounts for the selector
  const { data: clientAccounts = [], isLoading: clientsLoading } = useQuery<Array<{ id: string; name: string; companyName?: string }>>({
    queryKey: ['content-promo-client-accounts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/client-portal/admin/clients');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  // ---- Mutations ----

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const url = isEditing
        ? `/api/content-promotion/pages/${editingPage!.id}`
        : "/api/content-promotion/pages";
      const method = isEditing ? "PUT" : "POST";
      const res = await apiRequest(method, url, {
        ...data,
        campaignId: effectiveCampaignId,
        projectId: effectiveProjectId,
        organizationId: effectiveOrganizationId,
        clientAccountId: effectiveClientId,
      });
      const result = await res.json();
      
      // If campaignId is provided, update campaign with landing page URL
      if (effectiveCampaignId && result.id && result.slug) {
        try {
          const landingPageUrl = `${window.location.origin}/promo/${result.slug}`;
          await apiRequest("PATCH", `/api/campaigns/${effectiveCampaignId}`, {
            landingPageUrl,
          });
        } catch (err) {
          console.warn("Failed to update campaign landing page URL:", err);
          // Don't fail the main operation
        }
      }
      
      return result;
    },
    onSuccess: (data) => {
      const previewUrl = data.slug ? `/promo/${data.slug}` : null;
      toast({
        title: isEditing ? "Page updated" : "Page created",
        description: isEditing
          ? "Your content promotion page has been updated."
          : "Your content promotion page has been created." + (previewUrl ? ` Preview: ${previewUrl}` : ""),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
      if (effectiveCampaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}`] });
      }
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save page. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateWithAIMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCampaignId && !effectiveProjectId) {
        throw new Error("Campaign or Project context is required for AI generation");
      }
      const res = await apiRequest("POST", "/api/content-promotion/pages/generate", {
        campaignId: effectiveCampaignId,
        projectId: effectiveProjectId,
        organizationId: effectiveOrganizationId,
        clientId: effectiveClientId,
      }, { timeout: 180000 });
      return res.json();
    },
    onSuccess: (data) => {
      if (data) {
        setFormData((prev) => {
          const defaults = getDefaultFormData();
          return {
            ...prev,
            title: data.title || prev.title,
            slug: data.title ? generateSlug(data.title) : prev.slug,
            pageType: data.pageType || prev.pageType,
            templateTheme: data.templateTheme || prev.templateTheme,
            heroConfig: data.heroConfig ? { ...defaults.heroConfig, ...data.heroConfig } : prev.heroConfig,
            assetConfig: data.assetConfig ? { ...defaults.assetConfig, ...data.assetConfig } : prev.assetConfig,
            brandingConfig: data.brandingConfig ? { ...defaults.brandingConfig, ...data.brandingConfig } : prev.brandingConfig,
            formConfig: data.formConfig ? { ...defaults.formConfig, ...data.formConfig } : prev.formConfig,
            socialProofConfig: data.socialProofConfig ? { ...defaults.socialProofConfig, ...data.socialProofConfig } : prev.socialProofConfig,
            benefitsConfig: data.benefitsConfig ? { ...defaults.benefitsConfig, ...data.benefitsConfig } : prev.benefitsConfig,
            urgencyConfig: data.urgencyConfig ? { ...defaults.urgencyConfig, ...data.urgencyConfig } : prev.urgencyConfig,
            thankYouConfig: data.thankYouConfig ? { ...defaults.thankYouConfig, ...data.thankYouConfig } : prev.thankYouConfig,
            seoConfig: data.seoConfig ? { ...defaults.seoConfig, ...data.seoConfig } : prev.seoConfig,
            confirmationEmailConfig: data.confirmationEmailConfig ? { ...defaults.confirmationEmailConfig, ...data.confirmationEmailConfig } : prev.confirmationEmailConfig,
          };
        });
      }
      toast({
        title: "Content generated!",
        description: "AI has populated all page sections. Review each tab and customize as needed.",
      });
    },
    onError: (error: any) => {
      const isOIError = error?.message?.includes('Organizational Intelligence') || error?.message?.includes('Organization is required');
      toast({
        title: isOIError ? "Organization Intelligence Required" : "Generation failed",
        description: isOIError
          ? "Please complete the Organization Intelligence profile before generating content. All landing pages must be derived from Organizational Intelligence."
          : (error.message || "Failed to generate with AI. Please try again."),
        variant: "destructive",
      });
    },
  });

  function handleSave() {
    // Basic validation
    if (!formData.title.trim()) {
      toast({ title: "Validation Error", description: "Title is required.", variant: "destructive" });
      setActiveTab("basics");
      return;
    }
    if (!formData.heroConfig.headline.trim()) {
      toast({ title: "Validation Error", description: "Headline is required.", variant: "destructive" });
      setActiveTab("hero");
      return;
    }
    if (!formData.brandingConfig.companyName.trim()) {
      toast({ title: "Validation Error", description: "Company name is required.", variant: "destructive" });
      setActiveTab("hero");
      return;
    }
    saveMutation.mutate({ ...formData, clientAccountId: selectedClientId || undefined, campaignId: campaignId || undefined } as any);
  }

  // ---- Helpers for nested state updates ----

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateNested<K extends keyof FormData>(
    section: K,
    field: string,
    value: unknown,
  ) {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown>), [field]: value },
    }));
  }

  // ---- Form field helpers ----

  function addFormField(field: FormField) {
    setFormData((prev) => ({
      ...prev,
      formConfig: {
        ...prev.formConfig,
        fields: [...prev.formConfig.fields, field],
      },
    }));
  }

  function removeFormField(index: number) {
    setFormData((prev) => ({
      ...prev,
      formConfig: {
        ...prev.formConfig,
        fields: prev.formConfig.fields.filter((_, i) => i !== index),
      },
    }));
  }

  function updateFormField(index: number, updates: Partial<FormField>) {
    setFormData((prev) => ({
      ...prev,
      formConfig: {
        ...prev.formConfig,
        fields: prev.formConfig.fields.map((f, i) =>
          i === index ? { ...f, ...updates } : f,
        ),
      },
    }));
  }

  // ---- Array builder helpers ----

  function addArrayItem<K extends "stats" | "trustBadges" | "testimonials" | "companyLogos">(
    key: K,
    item: FormData["socialProofConfig"][K][number],
  ) {
    setFormData((prev) => ({
      ...prev,
      socialProofConfig: {
        ...prev.socialProofConfig,
        [key]: [...prev.socialProofConfig[key], item],
      },
    }));
  }

  function removeArrayItem<K extends "stats" | "trustBadges" | "testimonials" | "companyLogos">(
    key: K,
    index: number,
  ) {
    setFormData((prev) => ({
      ...prev,
      socialProofConfig: {
        ...prev.socialProofConfig,
        [key]: prev.socialProofConfig[key].filter((_, i) => i !== index),
      },
    }));
  }

  function updateArrayItem<K extends "stats" | "trustBadges" | "testimonials" | "companyLogos">(
    key: K,
    index: number,
    updates: Partial<FormData["socialProofConfig"][K][number]>,
  ) {
    setFormData((prev) => ({
      ...prev,
      socialProofConfig: {
        ...prev.socialProofConfig,
        [key]: prev.socialProofConfig[key].map((item, i) =>
          i === index ? { ...item, ...updates } : item,
        ),
      },
    }));
  }

  function addBenefitItem() {
    setFormData((prev) => ({
      ...prev,
      benefitsConfig: {
        ...prev.benefitsConfig,
        items: [...prev.benefitsConfig.items, { icon: "Target", title: "", description: "" }],
      },
    }));
  }

  function removeBenefitItem(index: number) {
    setFormData((prev) => ({
      ...prev,
      benefitsConfig: {
        ...prev.benefitsConfig,
        items: prev.benefitsConfig.items.filter((_, i) => i !== index),
      },
    }));
  }

  function updateBenefitItem(index: number, updates: Partial<BenefitItem>) {
    setFormData((prev) => ({
      ...prev,
      benefitsConfig: {
        ...prev.benefitsConfig,
        items: prev.benefitsConfig.items.map((item, i) =>
          i === index ? { ...item, ...updates } : item,
        ),
      },
    }));
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">
                {isEditing ? "Edit Content Promotion Page" : "Create Content Promotion Page"}
              </DialogTitle>
              <DialogDescription>
                {effectiveCampaignId || effectiveProjectId ? 
                  "Configure your landing page with AI assistance based on your campaign/project context." :
                  "Configure every aspect of your landing page across the tabs below."
                }
              </DialogDescription>
            </div>
            {(effectiveCampaignId || effectiveProjectId || effectiveClientId || effectiveOrganizationId) && (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {effectiveClientId && <span className="text-emerald-600">Client Linked</span>}
                {effectiveCampaignId && <span className="text-blue-600">Campaign Context</span>}
                {effectiveProjectId && <span className="text-purple-600">Project Context</span>}
                {effectiveOrganizationId && <span className="text-amber-600">Organization Context</span>}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-6 mt-4 mb-0 grid grid-cols-8 h-auto">
            <TabsTrigger value="basics" className="text-xs gap-1 py-2">
              <FileText className="h-3.5 w-3.5" />
              Basics
            </TabsTrigger>
            <TabsTrigger value="hero" className="text-xs gap-1 py-2">
              <Palette className="h-3.5 w-3.5" />
              Hero
            </TabsTrigger>
            <TabsTrigger value="asset" className="text-xs gap-1 py-2">
              <Image className="h-3.5 w-3.5" />
              Asset
            </TabsTrigger>
            <TabsTrigger value="form" className="text-xs gap-1 py-2">
              <FormInput className="h-3.5 w-3.5" />
              Form
            </TabsTrigger>
            <TabsTrigger value="social" className="text-xs gap-1 py-2">
              <Users className="h-3.5 w-3.5" />
              Social Proof
            </TabsTrigger>
            <TabsTrigger value="benefits" className="text-xs gap-1 py-2">
              <Star className="h-3.5 w-3.5" />
              Benefits
            </TabsTrigger>
            <TabsTrigger value="thankyou" className="text-xs gap-1 py-2">
              <Settings className="h-3.5 w-3.5" />
              Thank You
            </TabsTrigger>
            <TabsTrigger value="email" className="text-xs gap-1 py-2">
              <Mail className="h-3.5 w-3.5" />
              Email
            </TabsTrigger>
          </TabsList>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {/* ============================================================= */}
            {/* TAB 1: BASICS */}
            {/* ============================================================= */}
            <TabsContent value="basics" className="mt-0 space-y-6">
              {/* Client selector */}
              <div className="space-y-1.5">
                <Label>Client</Label>
                {clientsLoading ? (
                  <div className="flex h-10 items-center justify-center rounded-md border border-border bg-muted/50">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Select value={selectedClientId || "__none"} onValueChange={(v) => setSelectedClientId(v === "__none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No client</SelectItem>
                      {clientAccounts.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.companyName || client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Associate this page with a client account for tracking and AI generation context.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="page-title">Title <span className="text-destructive">*</span></Label>
                <Input
                  id="page-title"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  placeholder="e.g. 2026 State of Demand Generation Report"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="page-slug">Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">/promo/</span>
                  <Input
                    id="page-slug"
                    value={formData.slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      updateField("slug", e.target.value);
                    }}
                    placeholder="my-landing-page"
                    className="font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-generated from the title. Edit manually if needed.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Page Type</Label>
                <Select
                  value={formData.pageType}
                  onValueChange={(v) => updateField("pageType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        <div className="flex flex-col">
                          <span>{pt.label}</span>
                          <span className="text-xs text-muted-foreground">{pt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Template Theme</Label>
                <div className="grid grid-cols-5 gap-3">
                  {TEMPLATE_THEMES.map((theme) => (
                    <Card
                      key={theme.value}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        formData.templateTheme === theme.value
                          ? "ring-2 ring-primary shadow-md"
                          : "hover:ring-1 hover:ring-muted-foreground/30"
                      }`}
                      onClick={() => updateField("templateTheme", theme.value)}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex gap-0.5 h-3 rounded overflow-hidden">
                          {theme.colors.map((c, i) => (
                            <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div>
                          <p className="text-xs font-medium leading-tight">{theme.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            {theme.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 2: HERO & BRANDING */}
            {/* ============================================================= */}
            <TabsContent value="hero" className="mt-0 space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="hero-headline">Headline <span className="text-destructive">*</span></Label>
                <Input
                  id="hero-headline"
                  value={formData.heroConfig.headline}
                  onChange={(e) => updateNested("heroConfig", "headline", e.target.value)}
                  placeholder="The Ultimate Guide to Demand Generation"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hero-subheadline">Sub-Headline</Label>
                <Textarea
                  id="hero-subheadline"
                  value={formData.heroConfig.subHeadline}
                  onChange={(e) => updateNested("heroConfig", "subHeadline", e.target.value)}
                  placeholder="Learn the strategies used by top B2B teams to drive pipeline growth."
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hero-badge">Badge Text</Label>
                <Input
                  id="hero-badge"
                  value={formData.heroConfig.badgeText || ""}
                  onChange={(e) => updateNested("heroConfig", "badgeText", e.target.value)}
                  placeholder="Free Download"
                />
                <p className="text-xs text-muted-foreground">
                  Optional badge displayed above the headline (e.g. "Free Download", "Limited Time").
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hero-badge-icon">Badge Icon</Label>
                <Input
                  id="hero-badge-icon"
                  value={formData.heroConfig.badgeIcon || ""}
                  onChange={(e) => updateNested("heroConfig", "badgeIcon", e.target.value || undefined)}
                  placeholder="e.g. Download, Zap, Star"
                />
                <p className="text-xs text-muted-foreground">
                  Lucide icon name shown next to the badge text.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Background Style</Label>
                  <Select
                    value={formData.heroConfig.backgroundStyle}
                    onValueChange={(v) => updateNested("heroConfig", "backgroundStyle", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="pattern">Pattern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="hero-bg-value">Background Value</Label>
                  <Input
                    id="hero-bg-value"
                    value={formData.heroConfig.backgroundValue}
                    onChange={(e) => updateNested("heroConfig", "backgroundValue", e.target.value)}
                    placeholder={
                      formData.heroConfig.backgroundStyle === "gradient"
                        ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                        : formData.heroConfig.backgroundStyle === "image"
                        ? "https://example.com/hero-bg.jpg"
                        : "dots"
                    }
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <Separator />

              <h3 className="text-sm font-semibold">Branding</h3>

              <div className="space-y-1.5">
                <Label htmlFor="brand-company">Company Name <span className="text-destructive">*</span></Label>
                <Input
                  id="brand-company"
                  value={formData.brandingConfig.companyName}
                  onChange={(e) => updateNested("brandingConfig", "companyName", e.target.value)}
                  placeholder="Acme Corporation"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brand-logo">Logo URL</Label>
                <Input
                  id="brand-logo"
                  value={formData.brandingConfig.logoUrl || ""}
                  onChange={(e) => updateNested("brandingConfig", "logoUrl", e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ColorInput
                  label="Primary Color"
                  value={formData.brandingConfig.primaryColor}
                  onChange={(v) => updateNested("brandingConfig", "primaryColor", v)}
                />
                <ColorInput
                  label="Accent Color"
                  value={formData.brandingConfig.accentColor}
                  onChange={(v) => updateNested("brandingConfig", "accentColor", v)}
                />
              </div>

              {/* Color presets */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Quick Color Presets</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { primary: "#7c3aed", accent: "#3b82f6", label: "Purple & Blue" },
                    { primary: "#0f172a", accent: "#f59e0b", label: "Navy & Gold" },
                    { primary: "#dc2626", accent: "#1e293b", label: "Red & Charcoal" },
                    { primary: "#059669", accent: "#10b981", label: "Emerald" },
                    { primary: "#2563eb", accent: "#60a5fa", label: "Classic Blue" },
                    { primary: "#7c2d12", accent: "#ea580c", label: "Burnt Orange" },
                    { primary: "#be185d", accent: "#f472b6", label: "Rose Pink" },
                    { primary: "#0d9488", accent: "#2dd4bf", label: "Teal" },
                    { primary: "#4f46e5", accent: "#818cf8", label: "Indigo" },
                    { primary: "#0369a1", accent: "#38bdf8", label: "Sky Blue" },
                    { primary: "#15803d", accent: "#86efac", label: "Green Fresh" },
                    { primary: "#92400e", accent: "#fbbf24", label: "Amber" },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.label}
                      className={`flex items-center gap-0.5 rounded-md border px-2 py-1 text-[10px] transition-colors hover:ring-1 hover:ring-primary ${
                        formData.brandingConfig.primaryColor === preset.primary
                          ? "ring-2 ring-primary border-primary"
                          : "border-border"
                      }`}
                      onClick={() => {
                        updateNested("brandingConfig", "primaryColor", preset.primary);
                        updateNested("brandingConfig", "accentColor", preset.accent);
                      }}
                    >
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: preset.primary }} />
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: preset.accent }} />
                      <span className="ml-0.5 text-muted-foreground">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <ColorInput
                label="Text Color Override"
                value={formData.brandingConfig.textColor || ""}
                onChange={(v) => updateNested("brandingConfig", "textColor", v || undefined)}
              />
              <p className="text-xs text-muted-foreground -mt-4">
                Override the default text color on the landing page.
              </p>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 3: ASSET */}
            {/* ============================================================= */}
            <TabsContent value="asset" className="mt-0 space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="asset-title">Asset Title</Label>
                <Input
                  id="asset-title"
                  value={formData.assetConfig.title}
                  onChange={(e) => updateNested("assetConfig", "title", e.target.value)}
                  placeholder="2026 Demand Generation Benchmark Report"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-desc">Asset Description</Label>
                <Textarea
                  id="asset-desc"
                  value={formData.assetConfig.description}
                  onChange={(e) => updateNested("assetConfig", "description", e.target.value)}
                  placeholder="A comprehensive overview of the latest trends and benchmarks..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Asset Type</Label>
                  <Select
                    value={formData.assetConfig.assetType}
                    onValueChange={(v) => updateNested("assetConfig", "assetType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPES.map((at) => (
                        <SelectItem key={at.value} value={at.value}>
                          {at.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="asset-file-url">
                    File URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="asset-file-url"
                    value={formData.assetConfig.fileUrl}
                    onChange={(e) => updateNested("assetConfig", "fileUrl", e.target.value)}
                    placeholder="https://cdn.example.com/report.pdf"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-thumb">Thumbnail URL</Label>
                <Input
                  id="asset-thumb"
                  value={formData.assetConfig.thumbnailUrl || ""}
                  onChange={(e) => updateNested("assetConfig", "thumbnailUrl", e.target.value)}
                  placeholder="https://cdn.example.com/report-thumb.png"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="asset-size">File Size</Label>
                  <Input
                    id="asset-size"
                    value={formData.assetConfig.fileSize || ""}
                    onChange={(e) => updateNested("assetConfig", "fileSize", e.target.value)}
                    placeholder="2.4 MB"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="asset-pages">Page Count</Label>
                  <Input
                    id="asset-pages"
                    type="number"
                    value={formData.assetConfig.pageCount ?? ""}
                    onChange={(e) =>
                      updateNested(
                        "assetConfig",
                        "pageCount",
                        e.target.value ? parseInt(e.target.value, 10) : undefined,
                      )
                    }
                    placeholder="32"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="asset-readtime">Read Time</Label>
                  <Input
                    id="asset-readtime"
                    value={formData.assetConfig.readTime || ""}
                    onChange={(e) => updateNested("assetConfig", "readTime", e.target.value)}
                    placeholder="12 min read"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 4: FORM BUILDER */}
            {/* ============================================================= */}
            <TabsContent value="form" className="mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Form Fields</h3>
                <Badge variant="outline" className="text-xs">
                  {formData.formConfig.fields.length} field{formData.formConfig.fields.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center mr-1">Quick add:</span>
                {FIELD_PRESETS.map((preset) => {
                  const exists = formData.formConfig.fields.some(
                    (f) => f.name === preset.field.name,
                  );
                  return (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={exists}
                      onClick={() => addFormField({ ...preset.field })}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {preset.label}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    addFormField({
                      name: "",
                      label: "",
                      type: "text",
                      required: false,
                      placeholder: "",
                      prefillParam: "",
                      halfWidth: false,
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Custom Field
                </Button>
              </div>

              {/* Field list */}
              <div className="space-y-3">
                {formData.formConfig.fields.map((field, index) => (
                  <Card key={index} className="relative">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0 cursor-grab" />
                        <div className="flex-1 grid grid-cols-12 gap-2">
                          {/* Row 1 */}
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={field.name}
                              onChange={(e) => updateFormField(index, { name: e.target.value })}
                              placeholder="fieldName"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Label</Label>
                            <Input
                              value={field.label}
                              onChange={(e) => updateFormField(index, { label: e.target.value })}
                              placeholder="Display Label"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={field.type}
                              onValueChange={(v) =>
                                updateFormField(index, { type: v as FormField["type"] })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_TYPES.map((ft) => (
                                  <SelectItem key={ft.value} value={ft.value}>
                                    {ft.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Placeholder</Label>
                            <Input
                              value={field.placeholder || ""}
                              onChange={(e) =>
                                updateFormField(index, { placeholder: e.target.value })
                              }
                              placeholder="..."
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Pre-fill Param</Label>
                            <Input
                              value={field.prefillParam || ""}
                              onChange={(e) =>
                                updateFormField(index, { prefillParam: e.target.value })
                              }
                              placeholder={field.name || "param"}
                              className="h-8 text-xs"
                            />
                          </div>

                          {/* Row 2 - toggles */}
                          <div className="col-span-12 flex items-center gap-4 mt-1">
                            <label className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={field.required}
                                onCheckedChange={(checked) =>
                                  updateFormField(index, { required: !!checked })
                                }
                              />
                              Required
                            </label>
                            <label className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={field.halfWidth || false}
                                onCheckedChange={(checked) =>
                                  updateFormField(index, { halfWidth: !!checked })
                                }
                              />
                              Half Width
                            </label>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFormField(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {formData.formConfig.fields.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                    No form fields yet. Use the quick add buttons above to get started.
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="submit-btn-text">Submit Button Text</Label>
                  <Input
                    id="submit-btn-text"
                    value={formData.formConfig.submitButtonText}
                    onChange={(e) => updateNested("formConfig", "submitButtonText", e.target.value)}
                    placeholder="Download Now"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="consent-text">Consent Text</Label>
                <Textarea
                  id="consent-text"
                  value={formData.formConfig.consentText || ""}
                  onChange={(e) => updateNested("formConfig", "consentText", e.target.value)}
                  placeholder="I agree to receive relevant communications..."
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formData.formConfig.consentRequired || false}
                    onCheckedChange={(checked) =>
                      updateNested("formConfig", "consentRequired", !!checked)
                    }
                  />
                  Consent Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formData.formConfig.showProgressBar || false}
                    onCheckedChange={(checked) =>
                      updateNested("formConfig", "showProgressBar", !!checked)
                    }
                  />
                  Show Progress Bar
                </label>
              </div>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 5: SOCIAL PROOF */}
            {/* ============================================================= */}
            <TabsContent value="social" className="mt-0 space-y-6">
              {/* Stats */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Stats</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addArrayItem("stats", { value: "", label: "", icon: "Download" })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Stat
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.socialProofConfig.stats.map((stat, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={stat.value}
                        onChange={(e) =>
                          updateArrayItem("stats", index, { value: e.target.value })
                        }
                        placeholder="10,000+"
                        className="h-8 text-sm flex-1"
                      />
                      <Input
                        value={stat.label}
                        onChange={(e) =>
                          updateArrayItem("stats", index, { label: e.target.value })
                        }
                        placeholder="Downloads"
                        className="h-8 text-sm flex-1"
                      />
                      <Input
                        value={stat.icon || ""}
                        onChange={(e) =>
                          updateArrayItem("stats", index, { icon: e.target.value })
                        }
                        placeholder="Icon name"
                        className="h-8 text-sm w-28"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeArrayItem("stats", index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {formData.socialProofConfig.stats.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">No stats added yet.</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Trust Badges */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Trust Badges</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addArrayItem("trustBadges", { text: "", icon: "Shield" })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Badge
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.socialProofConfig.trustBadges.map((badge, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={badge.text}
                        onChange={(e) =>
                          updateArrayItem("trustBadges", index, { text: e.target.value })
                        }
                        placeholder="ISO 27001 Certified"
                        className="h-8 text-sm flex-1"
                      />
                      <Input
                        value={badge.icon}
                        onChange={(e) =>
                          updateArrayItem("trustBadges", index, { icon: e.target.value })
                        }
                        placeholder="Shield"
                        className="h-8 text-sm w-28"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeArrayItem("trustBadges", index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {formData.socialProofConfig.trustBadges.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">No trust badges added yet.</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Testimonials */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Testimonials</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      addArrayItem("testimonials", {
                        quote: "",
                        authorName: "",
                        authorTitle: "",
                        authorCompany: "",
                      })
                    }
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Testimonial
                  </Button>
                </div>
                <div className="space-y-3">
                  {formData.socialProofConfig.testimonials.map((testimonial, index) => (
                    <Card key={index}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <Label className="text-xs text-muted-foreground">
                            Testimonial {index + 1}
                          </Label>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeArrayItem("testimonials", index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Textarea
                          value={testimonial.quote}
                          onChange={(e) =>
                            updateArrayItem("testimonials", index, { quote: e.target.value })
                          }
                          placeholder="This report changed how we approach demand gen..."
                          rows={2}
                          className="text-sm"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            value={testimonial.authorName}
                            onChange={(e) =>
                              updateArrayItem("testimonials", index, {
                                authorName: e.target.value,
                              })
                            }
                            placeholder="Jane Doe"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={testimonial.authorTitle}
                            onChange={(e) =>
                              updateArrayItem("testimonials", index, {
                                authorTitle: e.target.value,
                              })
                            }
                            placeholder="VP of Marketing"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={testimonial.authorCompany}
                            onChange={(e) =>
                              updateArrayItem("testimonials", index, {
                                authorCompany: e.target.value,
                              })
                            }
                            placeholder="Acme Corp"
                            className="h-8 text-xs"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {formData.socialProofConfig.testimonials.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      No testimonials added yet.
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Company Logos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Company Logos</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addArrayItem("companyLogos", { name: "", logoUrl: "" })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Logo
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Display a strip of company/partner logos for credibility.
                </p>
                <div className="space-y-2">
                  {formData.socialProofConfig.companyLogos.map((logo, index) => (
                    <Card key={index}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Company Name</Label>
                              <Input
                                value={logo.name}
                                onChange={(e) =>
                                  updateArrayItem("companyLogos", index, { name: e.target.value })
                                }
                                placeholder="Acme Corp"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Logo URL</Label>
                              <Input
                                value={logo.logoUrl}
                                onChange={(e) =>
                                  updateArrayItem("companyLogos", index, { logoUrl: e.target.value })
                                }
                                placeholder="https://example.com/logo.png"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeArrayItem("companyLogos", index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {formData.socialProofConfig.companyLogos.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      No company logos added yet.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 6: BENEFITS */}
            {/* ============================================================= */}
            <TabsContent value="benefits" className="mt-0 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="benefits-title">Section Title</Label>
                  <Input
                    id="benefits-title"
                    value={formData.benefitsConfig.sectionTitle}
                    onChange={(e) => updateNested("benefitsConfig", "sectionTitle", e.target.value)}
                    placeholder="What You'll Learn"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="benefits-subtitle">Section Subtitle</Label>
                  <Input
                    id="benefits-subtitle"
                    value={formData.benefitsConfig.sectionSubtitle || ""}
                    onChange={(e) =>
                      updateNested("benefitsConfig", "sectionSubtitle", e.target.value)
                    }
                    placeholder="Key takeaways from this resource"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Benefit Items</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addBenefitItem}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Benefit
                </Button>
              </div>

              <div className="space-y-3">
                {formData.benefitsConfig.items.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-3 space-y-1">
                              <Label className="text-xs">Icon</Label>
                              <Input
                                value={item.icon}
                                onChange={(e) =>
                                  updateBenefitItem(index, { icon: e.target.value })
                                }
                                placeholder="Target"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="col-span-9 space-y-1">
                              <Label className="text-xs">Title</Label>
                              <Input
                                value={item.title}
                                onChange={(e) =>
                                  updateBenefitItem(index, { title: e.target.value })
                                }
                                placeholder="Data-Driven Strategies"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Description</Label>
                            <Textarea
                              value={item.description}
                              onChange={(e) =>
                                updateBenefitItem(index, { description: e.target.value })
                              }
                              placeholder="Learn how leading B2B teams use data to drive pipeline..."
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeBenefitItem(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {formData.benefitsConfig.items.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                    No benefit items yet. Click "Add Benefit" to get started.
                  </div>
                )}
              </div>

              <Separator />

              {/* Urgency Bar */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Urgency Bar
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Create urgency with a countdown timer, limited quantity, or social proof counter.
                    </p>
                  </div>
                  <Switch
                    checked={formData.urgencyConfig.enabled}
                    onCheckedChange={(checked) =>
                      updateNested("urgencyConfig", "enabled", checked)
                    }
                  />
                </div>

                {formData.urgencyConfig.enabled && (
                  <div className="space-y-4 pl-1">
                    <div className="space-y-1.5">
                      <Label>Urgency Type</Label>
                      <Select
                        value={formData.urgencyConfig.type}
                        onValueChange={(v) => updateNested("urgencyConfig", "type", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="countdown">Countdown Timer</SelectItem>
                          <SelectItem value="limited_quantity">Limited Quantity</SelectItem>
                          <SelectItem value="social_proof_count">Social Proof Count</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.urgencyConfig.type === "countdown" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="urgency-countdown">Countdown End Date</Label>
                          <Input
                            id="urgency-countdown"
                            type="datetime-local"
                            value={formData.urgencyConfig.countdownEndDate || ""}
                            onChange={(e) =>
                              updateNested("urgencyConfig", "countdownEndDate", e.target.value || undefined)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="urgency-msg-countdown">Message Template</Label>
                          <Input
                            id="urgency-msg-countdown"
                            value={formData.urgencyConfig.messageTemplate || ""}
                            onChange={(e) =>
                              updateNested("urgencyConfig", "messageTemplate", e.target.value || undefined)
                            }
                            placeholder="Offer ends in:"
                          />
                        </div>
                      </>
                    )}

                    {formData.urgencyConfig.type === "limited_quantity" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="urgency-qty">Quantity Remaining</Label>
                          <Input
                            id="urgency-qty"
                            type="number"
                            value={formData.urgencyConfig.quantityRemaining ?? ""}
                            onChange={(e) =>
                              updateNested("urgencyConfig", "quantityRemaining", e.target.value ? parseInt(e.target.value, 10) : undefined)
                            }
                            placeholder="50"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="urgency-msg-qty">Message Template</Label>
                          <Input
                            id="urgency-msg-qty"
                            value={formData.urgencyConfig.messageTemplate || ""}
                            onChange={(e) =>
                              updateNested("urgencyConfig", "messageTemplate", e.target.value || undefined)
                            }
                            placeholder="Only {n} spots remaining!"
                          />
                        </div>
                      </>
                    )}

                    {formData.urgencyConfig.type === "social_proof_count" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="urgency-downloads">Recent Downloads Count</Label>
                          <Input
                            id="urgency-downloads"
                            type="number"
                            value={formData.urgencyConfig.recentDownloadsCount ?? ""}
                            onChange={(e) =>
                              updateNested("urgencyConfig", "recentDownloadsCount", e.target.value ? parseInt(e.target.value, 10) : undefined)
                            }
                            placeholder="127"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="urgency-msg-social">Message Template</Label>
                          <Input
                            id="urgency-msg-social"
                            value={formData.urgencyConfig.messageTemplate || ""}
                            onChange={(e) =>
                              updateNested("urgencyConfig", "messageTemplate", e.target.value || undefined)
                            }
                            placeholder="people downloaded this today"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 7: THANK YOU & SEO */}
            {/* ============================================================= */}
            <TabsContent value="thankyou" className="mt-0 space-y-6">
              <h3 className="text-sm font-semibold">Thank You Page</h3>

              <div className="space-y-1.5">
                <Label htmlFor="ty-headline">Thank You Headline</Label>
                <Input
                  id="ty-headline"
                  value={formData.thankYouConfig.headline}
                  onChange={(e) => updateNested("thankYouConfig", "headline", e.target.value)}
                  placeholder="Thank You!"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ty-message">Thank You Message</Label>
                <Textarea
                  id="ty-message"
                  value={formData.thankYouConfig.message}
                  onChange={(e) => updateNested("thankYouConfig", "message", e.target.value)}
                  placeholder="Your download is ready. Check your email for a copy as well."
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formData.thankYouConfig.showDownloadButton}
                    onCheckedChange={(checked) =>
                      updateNested("thankYouConfig", "showDownloadButton", !!checked)
                    }
                  />
                  Show Download Button
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formData.thankYouConfig.showSocialShare}
                    onCheckedChange={(checked) =>
                      updateNested("thankYouConfig", "showSocialShare", !!checked)
                    }
                  />
                  Show Social Share
                </label>
              </div>

              {formData.thankYouConfig.showDownloadButton && (
                <div className="space-y-1.5">
                  <Label htmlFor="ty-btn-text">Download Button Text</Label>
                  <Input
                    id="ty-btn-text"
                    value={formData.thankYouConfig.downloadButtonText}
                    onChange={(e) =>
                      updateNested("thankYouConfig", "downloadButtonText", e.target.value)
                    }
                    placeholder="Download Your Copy"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ty-redirect">Redirect URL</Label>
                  <Input
                    id="ty-redirect"
                    value={formData.thankYouConfig.redirectUrl || ""}
                    onChange={(e) =>
                      updateNested("thankYouConfig", "redirectUrl", e.target.value || undefined)
                    }
                    placeholder="https://example.com/next-step"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ty-delay">Redirect Delay (seconds)</Label>
                  <Input
                    id="ty-delay"
                    type="number"
                    value={formData.thankYouConfig.redirectDelay ?? ""}
                    onChange={(e) =>
                      updateNested(
                        "thankYouConfig",
                        "redirectDelay",
                        e.target.value ? parseInt(e.target.value, 10) : undefined,
                      )
                    }
                    placeholder="5"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Additional Call-to-Action
                </h3>
                <p className="text-xs text-muted-foreground">
                  Show a secondary CTA button on the thank you page (e.g. "Learn More", "Visit Our Blog").
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ty-cta-text">Button Text</Label>
                    <Input
                      id="ty-cta-text"
                      value={formData.thankYouConfig.additionalCta?.text || ""}
                      onChange={(e) => {
                        const text = e.target.value;
                        const url = formData.thankYouConfig.additionalCta?.url || "";
                        updateNested("thankYouConfig", "additionalCta", text || url ? { text, url } : undefined);
                      }}
                      placeholder="Learn More"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ty-cta-url">Button URL</Label>
                    <Input
                      id="ty-cta-url"
                      value={formData.thankYouConfig.additionalCta?.url || ""}
                      onChange={(e) => {
                        const url = e.target.value;
                        const text = formData.thankYouConfig.additionalCta?.text || "";
                        updateNested("thankYouConfig", "additionalCta", text || url ? { text, url } : undefined);
                      }}
                      placeholder="https://example.com/learn-more"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <h3 className="text-sm font-semibold">SEO Settings</h3>

              <div className="space-y-1.5">
                <Label htmlFor="seo-title">Meta Title</Label>
                <Input
                  id="seo-title"
                  value={formData.seoConfig.metaTitle || ""}
                  onChange={(e) => updateNested("seoConfig", "metaTitle", e.target.value)}
                  placeholder="Download: 2026 Demand Generation Report | Acme"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="seo-desc">Meta Description</Label>
                <Textarea
                  id="seo-desc"
                  value={formData.seoConfig.metaDescription || ""}
                  onChange={(e) => updateNested("seoConfig", "metaDescription", e.target.value)}
                  placeholder="Get your free copy of the 2026 Demand Generation Benchmark Report..."
                  rows={2}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={formData.seoConfig.noIndex || false}
                  onCheckedChange={(checked) =>
                    updateNested("seoConfig", "noIndex", !!checked)
                  }
                />
                No Index (prevent search engine indexing)
              </label>
            </TabsContent>

            {/* ---- Email Tab ---- */}
            <TabsContent value="email" className="mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Confirmation Email</h3>
                  <p className="text-xs text-muted-foreground">Send an email with a download link after form submission</p>
                </div>
                <Switch
                  checked={formData.confirmationEmailConfig.enabled}
                  onCheckedChange={(checked) =>
                    updateNested("confirmationEmailConfig", "enabled", checked)
                  }
                />
              </div>

              {formData.confirmationEmailConfig.enabled && (
                <>
                  <Separator />
                  <div className="grid grid-cols-5 gap-6">
                    {/* Left panel — Form controls */}
                    <div className="col-span-2 space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="email-subject">Subject Line</Label>
                        <Input
                          id="email-subject"
                          value={formData.confirmationEmailConfig.subject}
                          onChange={(e) =>
                            updateNested("confirmationEmailConfig", "subject", e.target.value)
                          }
                          placeholder="Your download is ready!"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="email-headline">Headline</Label>
                        <Input
                          id="email-headline"
                          value={formData.confirmationEmailConfig.headline}
                          onChange={(e) =>
                            updateNested("confirmationEmailConfig", "headline", e.target.value)
                          }
                          placeholder="Thank you for downloading!"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="email-body">Body Text</Label>
                        <Textarea
                          id="email-body"
                          value={formData.confirmationEmailConfig.bodyText}
                          onChange={(e) =>
                            updateNested("confirmationEmailConfig", "bodyText", e.target.value)
                          }
                          placeholder="Here's your download link. You can access it anytime."
                          rows={3}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="email-btn-text">Download Button Text</Label>
                        <Input
                          id="email-btn-text"
                          value={formData.confirmationEmailConfig.downloadButtonText}
                          onChange={(e) =>
                            updateNested("confirmationEmailConfig", "downloadButtonText", e.target.value)
                          }
                          placeholder="Download Now"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="email-footer">Footer Text (optional)</Label>
                        <Textarea
                          id="email-footer"
                          value={formData.confirmationEmailConfig.footerText || ""}
                          onChange={(e) =>
                            updateNested("confirmationEmailConfig", "footerText", e.target.value || undefined)
                          }
                          placeholder="Questions? Reply to this email."
                          rows={2}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="email-replyto">Reply-To Address (optional)</Label>
                        <Input
                          id="email-replyto"
                          type="email"
                          value={formData.confirmationEmailConfig.replyTo || ""}
                          onChange={(e) =>
                            updateNested("confirmationEmailConfig", "replyTo", e.target.value || undefined)
                          }
                          placeholder="support@company.com"
                        />
                      </div>
                    </div>

                    {/* Right panel — Live email preview */}
                    <div className="col-span-3">
                      <div className="rounded-lg border overflow-hidden bg-muted/30 sticky top-0">
                        {/* Mock email client header */}
                        <div className="bg-muted px-4 py-2.5 border-b space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-muted-foreground w-12">From:</span>
                            <span className="text-foreground">{formData.brandingConfig.companyName || "Your Company"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-muted-foreground w-12">Subject:</span>
                            <span className="text-foreground font-medium">{formData.confirmationEmailConfig.subject || "Your download is ready!"}</span>
                          </div>
                          {formData.confirmationEmailConfig.replyTo && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-medium text-muted-foreground w-12">Reply-To:</span>
                              <span className="text-foreground">{formData.confirmationEmailConfig.replyTo}</span>
                            </div>
                          )}
                        </div>

                        {/* Email body preview */}
                        <div className="bg-white p-6">
                          <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 640, margin: "0 auto", color: "#111827" }}>
                            {/* Logo */}
                            {formData.brandingConfig.logoUrl && (
                              <div style={{ textAlign: "center", marginBottom: 16 }}>
                                <img
                                  src={formData.brandingConfig.logoUrl}
                                  alt={formData.brandingConfig.companyName || "Logo"}
                                  style={{ maxHeight: 48, maxWidth: 180 }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              </div>
                            )}

                            {/* Branded header bar */}
                            <div style={{
                              background: formData.brandingConfig.primaryColor || "#7c3aed",
                              height: 4,
                              borderRadius: 2,
                              marginBottom: 24,
                            }} />

                            {/* Headline */}
                            <h2 style={{
                              marginBottom: 12,
                              color: formData.brandingConfig.primaryColor || "#7c3aed",
                              fontSize: 22,
                              fontWeight: 700,
                            }}>
                              {formData.confirmationEmailConfig.headline || "Headline"}
                            </h2>

                            {/* Body */}
                            <p style={{ lineHeight: 1.6, fontSize: 15, color: "#374151", marginBottom: 24 }}>
                              {formData.confirmationEmailConfig.bodyText || "Body text..."}
                            </p>

                            {/* Download button */}
                            <div style={{ margin: "24px 0" }}>
                              <span style={{
                                background: formData.brandingConfig.primaryColor || "#7c3aed",
                                color: "#fff",
                                textDecoration: "none",
                                padding: "14px 24px",
                                borderRadius: 8,
                                display: "inline-block",
                                fontWeight: 600,
                                fontSize: 15,
                              }}>
                                <Download className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                                {formData.confirmationEmailConfig.downloadButtonText || "Download Now"}
                              </span>
                            </div>

                            {/* Footer */}
                            {formData.confirmationEmailConfig.footerText && (
                              <p style={{ lineHeight: 1.6, fontSize: 13, color: "#6b7280", marginTop: 24, borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                                {formData.confirmationEmailConfig.footerText}
                              </p>
                            )}

                            {/* Company name footer */}
                            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 16, textAlign: "center" as const }}>
                              Sent by {formData.brandingConfig.companyName || "Your Company"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </div>

          {/* OI requirement banner */}
          {!effectiveOrganizationId && !effectiveCampaignId && effectiveProjectId && !isEditing && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 mx-6 mb-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <div>
                <p className="font-medium">Organization Intelligence Required for AI Generation</p>
                <p className="mt-0.5">Select an organization to enable AI-powered page generation. Manual page building is still available.</p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t px-6 py-4 flex items-center justify-between gap-3 shrink-0">
            <div>
              {(effectiveCampaignId || effectiveProjectId) && !isEditing && (
                <Button
                  variant="outline"
                  onClick={() => generateWithAIMutation.mutate()}
                  disabled={generateWithAIMutation.isPending || saveMutation.isPending || !canGenerateWithAi}
                  className="gap-1.5"
                  title={!canGenerateWithAi ? "Organization Intelligence required for AI generation" : undefined}
                >
                  {generateWithAIMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {!generateWithAIMutation.isPending && <Sparkles className="h-4 w-4" />}
                  Generate with AI
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending || generateWithAIMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending || generateWithAIMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? "Save Changes" : "Create Page"}
              </Button>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
