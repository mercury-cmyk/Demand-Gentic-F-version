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
    companyLogos: Array;
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
    
      {label}
      
        
         onChange(e.target.value)}
          placeholder="#7c3aed"
          className="font-mono text-sm"
        />
      
    
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
  const [formData, setFormData] = useState(getDefaultFormData());

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
  const [selectedClientId, setSelectedClientId] = useState(clientId || "");
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
  const { data: clientAccounts = [], isLoading: clientsLoading } = useQuery>({
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

  function updateField(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateNested(
    section: K,
    field: string,
    value: unknown,
  ) {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as Record), [field]: value },
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

  function updateFormField(index: number, updates: Partial) {
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

  function addArrayItem(
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

  function removeArrayItem(
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

  function updateArrayItem(
    key: K,
    index: number,
    updates: Partial,
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

  function updateBenefitItem(index: number, updates: Partial) {
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
    
      
        {/* Header */}
        
          
            
              
                {isEditing ? "Edit Content Promotion Page" : "Create Content Promotion Page"}
              
              
                {effectiveCampaignId || effectiveProjectId ? 
                  "Configure your landing page with AI assistance based on your campaign/project context." :
                  "Configure every aspect of your landing page across the tabs below."
                }
              
            
            {(effectiveCampaignId || effectiveProjectId || effectiveClientId || effectiveOrganizationId) && (
              
                {effectiveClientId && Client Linked}
                {effectiveCampaignId && Campaign Context}
                {effectiveProjectId && Project Context}
                {effectiveOrganizationId && Organization Context}
              
            )}
          
        

        {/* Tabs */}
        
          
            
              
              Basics
            
            
              
              Hero
            
            
              
              Asset
            
            
              
              Form
            
            
              
              Social Proof
            
            
              
              Benefits
            
            
              
              Thank You
            
            
              
              Email
            
          

          {/* Scrollable content area */}
          
            {/* ============================================================= */}
            {/* TAB 1: BASICS */}
            {/* ============================================================= */}
            
              {/* Client selector */}
              
                Client
                {clientsLoading ? (
                  
                    
                  
                ) : (
                   setSelectedClientId(v === "__none" ? "" : v)}>
                    
                      
                    
                    
                      No client
                      {clientAccounts.map((client) => (
                        
                          {client.companyName || client.name}
                        
                      ))}
                    
                  
                )}
                
                  Associate this page with a client account for tracking and AI generation context.
                
              

              
                Title *
                 updateField("title", e.target.value)}
                  placeholder="e.g. 2026 State of Demand Generation Report"
                />
              

              
                Slug
                
                  /promo/
                   {
                      setSlugManuallyEdited(true);
                      updateField("slug", e.target.value);
                    }}
                    placeholder="my-landing-page"
                    className="font-mono text-sm"
                  />
                
                
                  Auto-generated from the title. Edit manually if needed.
                
              

              
                Page Type
                 updateField("pageType", v)}
                >
                  
                    
                  
                  
                    {PAGE_TYPES.map((pt) => (
                      
                        
                          {pt.label}
                          {pt.description}
                        
                      
                    ))}
                  
                
              

              
                Template Theme
                
                  {TEMPLATE_THEMES.map((theme) => (
                     updateField("templateTheme", theme.value)}
                    >
                      
                        
                          {theme.colors.map((c, i) => (
                            
                          ))}
                        
                        
                          {theme.label}
                          
                            {theme.description}
                          
                        
                      
                    
                  ))}
                
              
            

            {/* ============================================================= */}
            {/* TAB 2: HERO & BRANDING */}
            {/* ============================================================= */}
            
              
                Headline *
                 updateNested("heroConfig", "headline", e.target.value)}
                  placeholder="The Ultimate Guide to Demand Generation"
                />
              

              
                Sub-Headline
                 updateNested("heroConfig", "subHeadline", e.target.value)}
                  placeholder="Learn the strategies used by top B2B teams to drive pipeline growth."
                  rows={2}
                />
              

              
                Badge Text
                 updateNested("heroConfig", "badgeText", e.target.value)}
                  placeholder="Free Download"
                />
                
                  Optional badge displayed above the headline (e.g. "Free Download", "Limited Time").
                
              

              
                Badge Icon
                 updateNested("heroConfig", "badgeIcon", e.target.value || undefined)}
                  placeholder="e.g. Download, Zap, Star"
                />
                
                  Lucide icon name shown next to the badge text.
                
              

              
                
                  Background Style
                   updateNested("heroConfig", "backgroundStyle", v)}
                  >
                    
                      
                    
                    
                      Gradient
                      Image
                      Pattern
                    
                  
                

                
                  Background Value
                   updateNested("heroConfig", "backgroundValue", e.target.value)}
                    placeholder={
                      formData.heroConfig.backgroundStyle === "gradient"
                        ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                        : formData.heroConfig.backgroundStyle === "image"
                        ? "https://example.com/hero-bg.jpg"
                        : "dots"
                    }
                    className="font-mono text-sm"
                  />
                
              

              

              Branding

              
                Company Name *
                 updateNested("brandingConfig", "companyName", e.target.value)}
                  placeholder="Acme Corporation"
                />
              

              
                Logo URL
                 updateNested("brandingConfig", "logoUrl", e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              

              
                 updateNested("brandingConfig", "primaryColor", v)}
                />
                 updateNested("brandingConfig", "accentColor", v)}
                />
              

              {/* Color presets */}
              
                Quick Color Presets
                
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
                     {
                        updateNested("brandingConfig", "primaryColor", preset.primary);
                        updateNested("brandingConfig", "accentColor", preset.accent);
                      }}
                    >
                      
                      
                      {preset.label}
                    
                  ))}
                
              

               updateNested("brandingConfig", "textColor", v || undefined)}
              />
              
                Override the default text color on the landing page.
              
            

            {/* ============================================================= */}
            {/* TAB 3: ASSET */}
            {/* ============================================================= */}
            
              
                Asset Title
                 updateNested("assetConfig", "title", e.target.value)}
                  placeholder="2026 Demand Generation Benchmark Report"
                />
              

              
                Asset Description
                 updateNested("assetConfig", "description", e.target.value)}
                  placeholder="A comprehensive overview of the latest trends and benchmarks..."
                  rows={3}
                />
              

              
                
                  Asset Type
                   updateNested("assetConfig", "assetType", v)}
                  >
                    
                      
                    
                    
                      {ASSET_TYPES.map((at) => (
                        
                          {at.label}
                        
                      ))}
                    
                  
                

                
                  
                    File URL *
                  
                   updateNested("assetConfig", "fileUrl", e.target.value)}
                    placeholder="https://cdn.example.com/report.pdf"
                  />
                
              

              
                Thumbnail URL
                 updateNested("assetConfig", "thumbnailUrl", e.target.value)}
                  placeholder="https://cdn.example.com/report-thumb.png"
                />
              

              
                
                  File Size
                   updateNested("assetConfig", "fileSize", e.target.value)}
                    placeholder="2.4 MB"
                  />
                
                
                  Page Count
                  
                      updateNested(
                        "assetConfig",
                        "pageCount",
                        e.target.value ? parseInt(e.target.value, 10) : undefined,
                      )
                    }
                    placeholder="32"
                  />
                
                
                  Read Time
                   updateNested("assetConfig", "readTime", e.target.value)}
                    placeholder="12 min read"
                  />
                
              
            

            {/* ============================================================= */}
            {/* TAB 4: FORM BUILDER */}
            {/* ============================================================= */}
            
              
                Form Fields
                
                  {formData.formConfig.fields.length} field{formData.formConfig.fields.length !== 1 ? "s" : ""}
                
              

              {/* Quick presets */}
              
                Quick add:
                {FIELD_PRESETS.map((preset) => {
                  const exists = formData.formConfig.fields.some(
                    (f) => f.name === preset.field.name,
                  );
                  return (
                     addFormField({ ...preset.field })}
                    >
                      
                      {preset.label}
                    
                  );
                })}
                
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
                  
                  Custom Field
                
              

              {/* Field list */}
              
                {formData.formConfig.fields.map((field, index) => (
                  
                    
                      
                        
                        
                          {/* Row 1 */}
                          
                            Name
                             updateFormField(index, { name: e.target.value })}
                              placeholder="fieldName"
                              className="h-8 text-xs"
                            />
                          
                          
                            Label
                             updateFormField(index, { label: e.target.value })}
                              placeholder="Display Label"
                              className="h-8 text-xs"
                            />
                          
                          
                            Type
                            
                                updateFormField(index, { type: v as FormField["type"] })
                              }
                            >
                              
                                
                              
                              
                                {FIELD_TYPES.map((ft) => (
                                  
                                    {ft.label}
                                  
                                ))}
                              
                            
                          
                          
                            Placeholder
                            
                                updateFormField(index, { placeholder: e.target.value })
                              }
                              placeholder="..."
                              className="h-8 text-xs"
                            />
                          
                          
                            Pre-fill Param
                            
                                updateFormField(index, { prefillParam: e.target.value })
                              }
                              placeholder={field.name || "param"}
                              className="h-8 text-xs"
                            />
                          

                          {/* Row 2 - toggles */}
                          
                            
                              
                                  updateFormField(index, { required: !!checked })
                                }
                              />
                              Required
                            
                            
                              
                                  updateFormField(index, { halfWidth: !!checked })
                                }
                              />
                              Half Width
                            
                          
                        
                         removeFormField(index)}
                        >
                          
                        
                      
                    
                  
                ))}

                {formData.formConfig.fields.length === 0 && (
                  
                    No form fields yet. Use the quick add buttons above to get started.
                  
                )}
              

              

              
                
                  Submit Button Text
                   updateNested("formConfig", "submitButtonText", e.target.value)}
                    placeholder="Download Now"
                  />
                
              

              
                Consent Text
                 updateNested("formConfig", "consentText", e.target.value)}
                  placeholder="I agree to receive relevant communications..."
                  rows={2}
                />
              

              
                
                  
                      updateNested("formConfig", "consentRequired", !!checked)
                    }
                  />
                  Consent Required
                
                
                  
                      updateNested("formConfig", "showProgressBar", !!checked)
                    }
                  />
                  Show Progress Bar
                
              
            

            {/* ============================================================= */}
            {/* TAB 5: SOCIAL PROOF */}
            {/* ============================================================= */}
            
              {/* Stats */}
              
                
                  Stats
                   addArrayItem("stats", { value: "", label: "", icon: "Download" })}
                  >
                    
                    Add Stat
                  
                
                
                  {formData.socialProofConfig.stats.map((stat, index) => (
                    
                      
                          updateArrayItem("stats", index, { value: e.target.value })
                        }
                        placeholder="10,000+"
                        className="h-8 text-sm flex-1"
                      />
                      
                          updateArrayItem("stats", index, { label: e.target.value })
                        }
                        placeholder="Downloads"
                        className="h-8 text-sm flex-1"
                      />
                      
                          updateArrayItem("stats", index, { icon: e.target.value })
                        }
                        placeholder="Icon name"
                        className="h-8 text-sm w-28"
                      />
                       removeArrayItem("stats", index)}
                      >
                        
                      
                    
                  ))}
                  {formData.socialProofConfig.stats.length === 0 && (
                    No stats added yet.
                  )}
                
              

              

              {/* Trust Badges */}
              
                
                  Trust Badges
                   addArrayItem("trustBadges", { text: "", icon: "Shield" })}
                  >
                    
                    Add Badge
                  
                
                
                  {formData.socialProofConfig.trustBadges.map((badge, index) => (
                    
                      
                          updateArrayItem("trustBadges", index, { text: e.target.value })
                        }
                        placeholder="ISO 27001 Certified"
                        className="h-8 text-sm flex-1"
                      />
                      
                          updateArrayItem("trustBadges", index, { icon: e.target.value })
                        }
                        placeholder="Shield"
                        className="h-8 text-sm w-28"
                      />
                       removeArrayItem("trustBadges", index)}
                      >
                        
                      
                    
                  ))}
                  {formData.socialProofConfig.trustBadges.length === 0 && (
                    No trust badges added yet.
                  )}
                
              

              

              {/* Testimonials */}
              
                
                  Testimonials
                  
                      addArrayItem("testimonials", {
                        quote: "",
                        authorName: "",
                        authorTitle: "",
                        authorCompany: "",
                      })
                    }
                  >
                    
                    Add Testimonial
                  
                
                
                  {formData.socialProofConfig.testimonials.map((testimonial, index) => (
                    
                      
                        
                          
                            Testimonial {index + 1}
                          
                           removeArrayItem("testimonials", index)}
                          >
                            
                          
                        
                        
                            updateArrayItem("testimonials", index, { quote: e.target.value })
                          }
                          placeholder="This report changed how we approach demand gen..."
                          rows={2}
                          className="text-sm"
                        />
                        
                          
                              updateArrayItem("testimonials", index, {
                                authorName: e.target.value,
                              })
                            }
                            placeholder="Jane Doe"
                            className="h-8 text-xs"
                          />
                          
                              updateArrayItem("testimonials", index, {
                                authorTitle: e.target.value,
                              })
                            }
                            placeholder="VP of Marketing"
                            className="h-8 text-xs"
                          />
                          
                              updateArrayItem("testimonials", index, {
                                authorCompany: e.target.value,
                              })
                            }
                            placeholder="Acme Corp"
                            className="h-8 text-xs"
                          />
                        
                      
                    
                  ))}
                  {formData.socialProofConfig.testimonials.length === 0 && (
                    
                      No testimonials added yet.
                    
                  )}
                
              

              

              {/* Company Logos */}
              
                
                  Company Logos
                   addArrayItem("companyLogos", { name: "", logoUrl: "" })}
                  >
                    
                    Add Logo
                  
                
                
                  Display a strip of company/partner logos for credibility.
                
                
                  {formData.socialProofConfig.companyLogos.map((logo, index) => (
                    
                      
                        
                          
                            
                              Company Name
                              
                                  updateArrayItem("companyLogos", index, { name: e.target.value })
                                }
                                placeholder="Acme Corp"
                                className="h-8 text-xs"
                              />
                            
                            
                              Logo URL
                              
                                  updateArrayItem("companyLogos", index, { logoUrl: e.target.value })
                                }
                                placeholder="https://example.com/logo.png"
                                className="h-8 text-xs"
                              />
                            
                          
                           removeArrayItem("companyLogos", index)}
                          >
                            
                          
                        
                      
                    
                  ))}
                  {formData.socialProofConfig.companyLogos.length === 0 && (
                    
                      No company logos added yet.
                    
                  )}
                
              
            

            {/* ============================================================= */}
            {/* TAB 6: BENEFITS */}
            {/* ============================================================= */}
            
              
                
                  Section Title
                   updateNested("benefitsConfig", "sectionTitle", e.target.value)}
                    placeholder="What You'll Learn"
                  />
                
                
                  Section Subtitle
                  
                      updateNested("benefitsConfig", "sectionSubtitle", e.target.value)
                    }
                    placeholder="Key takeaways from this resource"
                  />
                
              

              
                Benefit Items
                
                  
                  Add Benefit
                
              

              
                {formData.benefitsConfig.items.map((item, index) => (
                  
                    
                      
                        
                          
                            
                              Icon
                              
                                  updateBenefitItem(index, { icon: e.target.value })
                                }
                                placeholder="Target"
                                className="h-8 text-xs"
                              />
                            
                            
                              Title
                              
                                  updateBenefitItem(index, { title: e.target.value })
                                }
                                placeholder="Data-Driven Strategies"
                                className="h-8 text-xs"
                              />
                            
                          
                          
                            Description
                            
                                updateBenefitItem(index, { description: e.target.value })
                              }
                              placeholder="Learn how leading B2B teams use data to drive pipeline..."
                              rows={2}
                              className="text-sm"
                            />
                          
                        
                         removeBenefitItem(index)}
                        >
                          
                        
                      
                    
                  
                ))}
                {formData.benefitsConfig.items.length === 0 && (
                  
                    No benefit items yet. Click "Add Benefit" to get started.
                  
                )}
              

              

              {/* Urgency Bar */}
              
                
                  
                    
                      
                      Urgency Bar
                    
                    
                      Create urgency with a countdown timer, limited quantity, or social proof counter.
                    
                  
                  
                      updateNested("urgencyConfig", "enabled", checked)
                    }
                  />
                

                {formData.urgencyConfig.enabled && (
                  
                    
                      Urgency Type
                       updateNested("urgencyConfig", "type", v)}
                      >
                        
                          
                        
                        
                          Countdown Timer
                          Limited Quantity
                          Social Proof Count
                        
                      
                    

                    {formData.urgencyConfig.type === "countdown" && (
                      <>
                        
                          Countdown End Date
                          
                              updateNested("urgencyConfig", "countdownEndDate", e.target.value || undefined)
                            }
                          />
                        
                        
                          Message Template
                          
                              updateNested("urgencyConfig", "messageTemplate", e.target.value || undefined)
                            }
                            placeholder="Offer ends in:"
                          />
                        
                      
                    )}

                    {formData.urgencyConfig.type === "limited_quantity" && (
                      <>
                        
                          Quantity Remaining
                          
                              updateNested("urgencyConfig", "quantityRemaining", e.target.value ? parseInt(e.target.value, 10) : undefined)
                            }
                            placeholder="50"
                          />
                        
                        
                          Message Template
                          
                              updateNested("urgencyConfig", "messageTemplate", e.target.value || undefined)
                            }
                            placeholder="Only {n} spots remaining!"
                          />
                        
                      
                    )}

                    {formData.urgencyConfig.type === "social_proof_count" && (
                      <>
                        
                          Recent Downloads Count
                          
                              updateNested("urgencyConfig", "recentDownloadsCount", e.target.value ? parseInt(e.target.value, 10) : undefined)
                            }
                            placeholder="127"
                          />
                        
                        
                          Message Template
                          
                              updateNested("urgencyConfig", "messageTemplate", e.target.value || undefined)
                            }
                            placeholder="people downloaded this today"
                          />
                        
                      
                    )}
                  
                )}
              
            

            {/* ============================================================= */}
            {/* TAB 7: THANK YOU & SEO */}
            {/* ============================================================= */}
            
              Thank You Page

              
                Thank You Headline
                 updateNested("thankYouConfig", "headline", e.target.value)}
                  placeholder="Thank You!"
                />
              

              
                Thank You Message
                 updateNested("thankYouConfig", "message", e.target.value)}
                  placeholder="Your download is ready. Check your email for a copy as well."
                  rows={3}
                />
              

              
                
                  
                      updateNested("thankYouConfig", "showDownloadButton", !!checked)
                    }
                  />
                  Show Download Button
                
                
                  
                      updateNested("thankYouConfig", "showSocialShare", !!checked)
                    }
                  />
                  Show Social Share
                
              

              {formData.thankYouConfig.showDownloadButton && (
                
                  Download Button Text
                  
                      updateNested("thankYouConfig", "downloadButtonText", e.target.value)
                    }
                    placeholder="Download Your Copy"
                  />
                
              )}

              
                
                  Redirect URL
                  
                      updateNested("thankYouConfig", "redirectUrl", e.target.value || undefined)
                    }
                    placeholder="https://example.com/next-step"
                  />
                
                
                  Redirect Delay (seconds)
                  
                      updateNested(
                        "thankYouConfig",
                        "redirectDelay",
                        e.target.value ? parseInt(e.target.value, 10) : undefined,
                      )
                    }
                    placeholder="5"
                  />
                
              

              

              
                
                  
                  Additional Call-to-Action
                
                
                  Show a secondary CTA button on the thank you page (e.g. "Learn More", "Visit Our Blog").
                
                
                  
                    Button Text
                     {
                        const text = e.target.value;
                        const url = formData.thankYouConfig.additionalCta?.url || "";
                        updateNested("thankYouConfig", "additionalCta", text || url ? { text, url } : undefined);
                      }}
                      placeholder="Learn More"
                    />
                  
                  
                    Button URL
                     {
                        const url = e.target.value;
                        const text = formData.thankYouConfig.additionalCta?.text || "";
                        updateNested("thankYouConfig", "additionalCta", text || url ? { text, url } : undefined);
                      }}
                      placeholder="https://example.com/learn-more"
                    />
                  
                
              

              

              SEO Settings

              
                Meta Title
                 updateNested("seoConfig", "metaTitle", e.target.value)}
                  placeholder="Download: 2026 Demand Generation Report | Acme"
                />
              

              
                Meta Description
                 updateNested("seoConfig", "metaDescription", e.target.value)}
                  placeholder="Get your free copy of the 2026 Demand Generation Benchmark Report..."
                  rows={2}
                />
              

              
                
                    updateNested("seoConfig", "noIndex", !!checked)
                  }
                />
                No Index (prevent search engine indexing)
              
            

            {/* ---- Email Tab ---- */}
            
              
                
                  Confirmation Email
                  Send an email with a download link after form submission
                
                
                    updateNested("confirmationEmailConfig", "enabled", checked)
                  }
                />
              

              {formData.confirmationEmailConfig.enabled && (
                <>
                  
                  
                    {/* Left panel — Form controls */}
                    
                      
                        Subject Line
                        
                            updateNested("confirmationEmailConfig", "subject", e.target.value)
                          }
                          placeholder="Your download is ready!"
                        />
                      

                      
                        Headline
                        
                            updateNested("confirmationEmailConfig", "headline", e.target.value)
                          }
                          placeholder="Thank you for downloading!"
                        />
                      

                      
                        Body Text
                        
                            updateNested("confirmationEmailConfig", "bodyText", e.target.value)
                          }
                          placeholder="Here's your download link. You can access it anytime."
                          rows={3}
                        />
                      

                      
                        Download Button Text
                        
                            updateNested("confirmationEmailConfig", "downloadButtonText", e.target.value)
                          }
                          placeholder="Download Now"
                        />
                      

                      
                        Footer Text (optional)
                        
                            updateNested("confirmationEmailConfig", "footerText", e.target.value || undefined)
                          }
                          placeholder="Questions? Reply to this email."
                          rows={2}
                        />
                      

                      
                        Reply-To Address (optional)
                        
                            updateNested("confirmationEmailConfig", "replyTo", e.target.value || undefined)
                          }
                          placeholder="support@company.com"
                        />
                      
                    

                    {/* Right panel — Live email preview */}
                    
                      
                        {/* Mock email client header */}
                        
                          
                            From:
                            {formData.brandingConfig.companyName || "Your Company"}
                          
                          
                            Subject:
                            {formData.confirmationEmailConfig.subject || "Your download is ready!"}
                          
                          {formData.confirmationEmailConfig.replyTo && (
                            
                              Reply-To:
                              {formData.confirmationEmailConfig.replyTo}
                            
                          )}
                        

                        {/* Email body preview */}
                        
                          
                            {/* Logo */}
                            {formData.brandingConfig.logoUrl && (
                              
                                 { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              
                            )}

                            {/* Branded header bar */}
                            

                            {/* Headline */}
                            
                              {formData.confirmationEmailConfig.headline || "Headline"}
                            

                            {/* Body */}
                            
                              {formData.confirmationEmailConfig.bodyText || "Body text..."}
                            

                            {/* Download button */}
                            
                              
                                
                                {formData.confirmationEmailConfig.downloadButtonText || "Download Now"}
                              
                            

                            {/* Footer */}
                            {formData.confirmationEmailConfig.footerText && (
                              
                                {formData.confirmationEmailConfig.footerText}
                              
                            )}

                            {/* Company name footer */}
                            
                              Sent by {formData.brandingConfig.companyName || "Your Company"}
                            
                          
                        
                      
                    
                  
                
              )}
            
          

          {/* OI requirement banner */}
          {!effectiveOrganizationId && !effectiveCampaignId && effectiveProjectId && !isEditing && (
            
              
              
                Organization Intelligence Required for AI Generation
                Select an organization to enable AI-powered page generation. Manual page building is still available.
              
            
          )}

          {/* Footer */}
          
            
              {(effectiveCampaignId || effectiveProjectId) && !isEditing && (
                 generateWithAIMutation.mutate()}
                  disabled={generateWithAIMutation.isPending || saveMutation.isPending || !canGenerateWithAi}
                  className="gap-1.5"
                  title={!canGenerateWithAi ? "Organization Intelligence required for AI generation" : undefined}
                >
                  {generateWithAIMutation.isPending && }
                  {!generateWithAIMutation.isPending && }
                  Generate with AI
                
              )}
            
            
               onOpenChange(false)} disabled={saveMutation.isPending || generateWithAIMutation.isPending}>
                Cancel
              
              
                {saveMutation.isPending && }
                {isEditing ? "Save Changes" : "Create Page"}
              
            
          
        
      
    
  );
}