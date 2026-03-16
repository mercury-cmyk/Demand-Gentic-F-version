import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  BookOpen,
  Video,
  Globe,
  Shield,
  CheckCircle,
  Target,
  Users,
  Brain,
  Zap,
  Star,
  Award,
  Clock,
  TrendingUp,
  BarChart,
  Lock,
  Mail,
  Phone,
  Building2,
  Sparkles,
  ArrowRight,
  Play,
  Calendar,
  Eye,
  Heart,
  ThumbsUp,
  Lightbulb,
  Rocket,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Share2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

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

interface PageConfig {
  id: string;
  title: string;
  slug: string;
  pageType: "gated_download" | "ungated_download" | "webinar_registration" | "demo_request" | "confirmation";
  status: string;
  templateTheme: "executive" | "modern_gradient" | "clean_minimal" | "bold_impact" | "tech_forward";
  heroConfig: {
    headline: string;
    subHeadline: string;
    backgroundStyle: "gradient" | "image" | "pattern" | "video";
    backgroundValue: string;
    badgeText?: string;
    badgeIcon?: string;
  };
  assetConfig?: {
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
    textColor?: string;
    logoUrl?: string;
    companyName: string;
  };
  formConfig?: {
    fields: FormField[];
    submitButtonText: string;
    submitButtonIcon?: string;
    consentText?: string;
    consentRequired?: boolean;
    showProgressBar?: boolean;
  };
  socialProofConfig?: {
    stats?: Array<{ value: string; label: string; icon?: string }>;
    testimonials?: Array<{
      quote: string;
      authorName: string;
      authorTitle: string;
      authorCompany: string;
    }>;
    companyLogos?: Array<{ name: string; logoUrl: string }>;
    trustBadges?: Array<{ text: string; icon: string }>;
  };
  benefitsConfig?: {
    sectionTitle?: string;
    sectionSubtitle?: string;
    items: Array<{ icon: string; title: string; description: string }>;
  };
  urgencyConfig?: {
    enabled: boolean;
    type: "countdown" | "limited_quantity" | "social_proof_count";
    countdownEndDate?: string;
    quantityRemaining?: number;
    recentDownloadsCount?: number;
    messageTemplate?: string;
  };
  thankYouConfig?: {
    headline: string;
    message: string;
    showDownloadButton: boolean;
    downloadButtonText?: string;
    redirectUrl?: string;
    redirectDelay?: number;
    showSocialShare?: boolean;
    additionalCta?: { text: string; url: string };
  };
  seoConfig?: {
    metaTitle?: string;
    metaDescription?: string;
  };
}

// ─── Icon Mapping ───────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Download,
  FileText,
  BookOpen,
  Video,
  Globe,
  Shield,
  CheckCircle,
  Target,
  Users,
  Brain,
  Zap,
  Star,
  Award,
  Clock,
  TrendingUp,
  BarChart,
  Lock,
  Mail,
  Phone,
  Building2,
  Sparkles,
  ArrowRight,
  Play,
  Calendar,
  Eye,
  Heart,
  ThumbsUp,
  Lightbulb,
  Rocket,
  ExternalLink,
  Share2,
};

function getIcon(iconName: string): LucideIcon {
  if (!iconName) return Sparkles;
  // Try exact match first
  if (ICON_MAP[iconName]) return ICON_MAP[iconName];
  // Try case-insensitive match
  const lower = iconName.toLowerCase().replace(/[-_\s]/g, "");
  const found = Object.entries(ICON_MAP).find(
    ([key]) => key.toLowerCase() === lower
  );
  return found ? found[1] : Sparkles;
}

// ─── Theme System ───────────────────────────────────────────────────────────────

interface ThemeClasses {
  page: string;
  header: string;
  heroSection: string;
  heroHeadline: string;
  heroSubheadline: string;
  badge: string;
  formCard: string;
  formInput: string;
  formLabel: string;
  submitButton: string;
  sectionBg: string;
  sectionTitle: string;
  benefitCard: string;
  statCard: string;
  testimonialCard: string;
  footer: string;
  urgencyBar: string;
  floatingCta: string;
}

function getThemeClasses(theme: PageConfig["templateTheme"]): ThemeClasses {
  switch (theme) {
    case "executive":
      return {
        page: "bg-slate-950 text-white min-h-screen",
        header: "bg-slate-900/80 backdrop-blur-md border-b border-white/10",
        heroSection: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden",
        heroHeadline: "font-serif text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight",
        heroSubheadline: "text-lg md:text-xl text-slate-300 leading-relaxed font-light",
        badge: "bg-amber-500/20 text-amber-300 border border-amber-500/30 backdrop-blur-sm",
        formCard: "bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl",
        formInput: "bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-amber-400 focus:ring-amber-400/20",
        formLabel: "text-slate-200 font-medium",
        submitButton: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-semibold shadow-lg shadow-amber-500/25",
        sectionBg: "bg-slate-900/50",
        sectionTitle: "font-serif text-3xl md:text-4xl font-bold text-white",
        benefitCard: "bg-white/5 backdrop-blur border border-white/10 hover:border-amber-500/30 transition-all duration-300",
        statCard: "bg-white/5 backdrop-blur border border-white/10",
        testimonialCard: "bg-white/5 backdrop-blur border border-white/10 rounded-xl",
        footer: "bg-slate-950 border-t border-white/10 text-slate-400",
        urgencyBar: "bg-gradient-to-r from-amber-600 to-amber-500 text-slate-900",
        floatingCta: "bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/25",
      };

    case "modern_gradient":
      return {
        page: "bg-white text-slate-900 min-h-screen",
        header: "bg-white/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm",
        heroSection: "relative overflow-hidden",
        heroHeadline: "text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight",
        heroSubheadline: "text-lg md:text-xl text-white/90 leading-relaxed",
        badge: "bg-white/20 text-white border border-white/30 backdrop-blur-sm rounded-full",
        formCard: "bg-white shadow-2xl rounded-2xl border-0 relative overflow-hidden",
        formInput: "bg-slate-50 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20",
        formLabel: "text-slate-700 font-medium",
        submitButton: "text-white font-semibold shadow-xl rounded-xl text-lg",
        sectionBg: "bg-slate-50",
        sectionTitle: "text-3xl md:text-4xl font-extrabold text-slate-900",
        benefitCard: "bg-white shadow-lg hover:shadow-xl border border-slate-100 rounded-2xl transition-all duration-300 hover:-translate-y-1",
        statCard: "bg-white shadow-md rounded-2xl border border-slate-100",
        testimonialCard: "bg-white shadow-lg border border-slate-100 rounded-2xl",
        footer: "bg-slate-900 text-slate-400",
        urgencyBar: "text-white font-semibold",
        floatingCta: "text-white shadow-xl rounded-full",
      };

    case "clean_minimal":
      return {
        page: "bg-white text-slate-800 min-h-screen",
        header: "bg-white border-b border-slate-100",
        heroSection: "bg-white relative",
        heroHeadline: "text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-slate-900 leading-tight",
        heroSubheadline: "text-lg md:text-xl text-slate-500 leading-relaxed font-light max-w-2xl",
        badge: "bg-slate-100 text-slate-700 border border-slate-200 rounded-full",
        formCard: "bg-transparent border-0 shadow-none",
        formInput: "bg-white border-slate-200 focus:ring-1 rounded-lg",
        formLabel: "text-slate-600 font-medium text-sm",
        submitButton: "font-medium shadow-sm rounded-lg",
        sectionBg: "bg-slate-50/50",
        sectionTitle: "text-3xl md:text-4xl font-semibold text-slate-900",
        benefitCard: "bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-all duration-300",
        statCard: "bg-white border border-slate-100 rounded-xl",
        testimonialCard: "bg-slate-50 border border-slate-100 rounded-xl",
        footer: "bg-white border-t border-slate-100 text-slate-400",
        urgencyBar: "bg-slate-900 text-white",
        floatingCta: "shadow-md rounded-lg",
      };

    case "bold_impact":
      return {
        page: "bg-slate-950 text-white min-h-screen",
        header: "bg-slate-950 border-b border-white/5",
        heroSection: "bg-slate-950 relative overflow-hidden",
        heroHeadline: "text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-none uppercase",
        heroSubheadline: "text-xl md:text-2xl text-slate-300 leading-relaxed font-light",
        badge: "bg-white text-slate-900 font-bold border-0 rounded-sm uppercase text-xs tracking-widest",
        formCard: "bg-white text-slate-900 shadow-2xl rounded-lg",
        formInput: "bg-slate-50 border-slate-200 text-slate-900 focus:ring-2",
        formLabel: "text-slate-700 font-bold uppercase text-xs tracking-wider",
        submitButton: "font-black uppercase tracking-wider text-lg py-6 rounded-lg shadow-2xl",
        sectionBg: "bg-white text-slate-900",
        sectionTitle: "text-4xl md:text-5xl font-black text-inherit uppercase tracking-tight",
        benefitCard: "bg-slate-50 border-2 border-slate-200 rounded-lg hover:border-current transition-all duration-300",
        statCard: "bg-slate-50 rounded-lg border-2 border-slate-200",
        testimonialCard: "bg-slate-50 border-2 border-slate-200 rounded-lg",
        footer: "bg-slate-950 text-slate-500 border-t border-white/5",
        urgencyBar: "text-white font-black uppercase tracking-wider",
        floatingCta: "fixed bottom-4 left-4 right-4 md:hidden z-50 py-4 font-black uppercase tracking-wider rounded-lg shadow-2xl text-lg",
      };

    case "tech_forward":
      return {
        page: "bg-gray-950 text-white min-h-screen relative",
        header: "bg-gray-950/80 backdrop-blur-lg border-b border-white/5",
        heroSection: "bg-gray-950 relative overflow-hidden",
        heroHeadline: "text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight",
        heroSubheadline: "text-lg md:text-xl text-gray-400 leading-relaxed",
        badge: "bg-white/5 border border-white/20 backdrop-blur-sm text-white rounded-full font-mono text-xs",
        formCard: "bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl",
        formInput: "bg-gray-800/50 border-white/10 text-white placeholder:text-gray-500 font-mono text-sm",
        formLabel: "text-gray-300 font-mono text-xs uppercase tracking-wider",
        submitButton: "font-semibold shadow-xl rounded-xl",
        sectionBg: "bg-gray-900/30",
        sectionTitle: "text-3xl md:text-4xl font-bold text-white",
        benefitCard: "bg-gray-900/50 backdrop-blur border border-white/5 hover:border-white/20 rounded-xl transition-all duration-300",
        statCard: "bg-gray-900/50 backdrop-blur border border-white/5 rounded-xl font-mono",
        testimonialCard: "bg-gray-900/50 backdrop-blur border border-white/10 rounded-xl",
        footer: "bg-gray-950 border-t border-white/5 text-gray-500",
        urgencyBar: "bg-gray-900 border border-white/10 text-white",
        floatingCta: "shadow-xl rounded-xl",
      };

    default:
      return getThemeClasses("modern_gradient");
  }
}

// ─── Geometric Pattern SVG for tech_forward ─────────────────────────────────────

function GeometricPatternOverlay({ accentColor }: { accentColor: string }) {
  return (
    <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="geo-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke={accentColor}
              strokeWidth="0.5"
            />
            <circle cx="0" cy="0" r="1.5" fill={accentColor} />
            <circle cx="60" cy="60" r="1.5" fill={accentColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#geo-grid)" />
      </svg>
    </div>
  );
}

// ─── Animated Counter Hook ──────────────────────────────────────────────────────

function useAnimatedCounter(target: number, duration: number = 2000, shouldAnimate: boolean = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!shouldAnimate) {
      setCount(target);
      return;
    }
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration, shouldAnimate]);

  return count;
}

// ─── Countdown Timer Hook ───────────────────────────────────────────────────────

function useCountdown(endDate: string | undefined) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!endDate) return;

    const calculate = () => {
      const end = new Date(endDate).getTime();
      const now = Date.now();
      const diff = Math.max(0, end - now);

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  return timeLeft;
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ContentPromoPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [submitted, setSubmitted] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const mountTimeRef = useRef(Date.now());
  const formStartSentRef = useRef(false);

  // ─── URL Params ─────────────────────────────────────────────────────────────

  const urlParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const utmParams = useMemo(() => ({
    utm_source: urlParams.get("utm_source") || "",
    utm_medium: urlParams.get("utm_medium") || "",
    utm_campaign: urlParams.get("utm_campaign") || "",
    utm_term: urlParams.get("utm_term") || "",
    utm_content: urlParams.get("utm_content") || "",
  }), [urlParams]);

  // ─── Fetch Page Config ──────────────────────────────────────────────────────

  const isPreview = urlParams.get("preview") === "true";

  const { data: pageConfig, isLoading, error } = useQuery<PageConfig>({
    queryKey: [`/api/public/promo/${slug}`, isPreview],
    enabled: !!slug,
    queryFn: async () => {
      const url = isPreview
        ? `/api/public/promo/${slug}?preview=true`
        : `/api/public/promo/${slug}`;
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Page not found");
      return res.json();
    },
  });

  // ─── SEO ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!pageConfig) return;
    const title = pageConfig.seoConfig?.metaTitle || pageConfig.title;
    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (pageConfig.seoConfig?.metaDescription) {
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", pageConfig.seoConfig.metaDescription);
    }
  }, [pageConfig]);

  // ─── Time on Page Tracking ──────────────────────────────────────────────────

  useEffect(() => {
    const handleUnload = () => {
      const timeOnPage = Math.floor((Date.now() - mountTimeRef.current) / 1000);
      const data = JSON.stringify({
        event: "time_on_page",
        duration: timeOnPage,
        ...utmParams,
      });
      const trackUrl = isPreview
        ? `/api/public/promo/${slug}/track?preview=true`
        : `/api/public/promo/${slug}/track`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(trackUrl, data);
      } else {
        fetch(trackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: data,
          keepalive: true,
        });
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [slug, utmParams]);

  // ─── Build Prefill Values ───────────────────────────────────────────────────

  const getPrefillValues = useCallback(
    (fields: FormField[]) => {
      const values: Record<string, string> = {};
      const standardParams: Record<string, string> = {
        firstName: urlParams.get("firstName") || "",
        lastName: urlParams.get("lastName") || "",
        email: urlParams.get("email") || "",
        company: urlParams.get("company") || "",
        jobTitle: urlParams.get("jobTitle") || "",
        phone: urlParams.get("phone") || "",
      };

      fields.forEach((field) => {
        // Check custom prefillParam first, then standard params by field name
        const customValue = field.prefillParam
          ? urlParams.get(field.prefillParam) || ""
          : "";
        const standardValue = standardParams[field.name] || "";
        values[field.name] = customValue || standardValue || "";
      });

      return values;
    },
    [urlParams]
  );

  // ─── Form Schema & Setup ───────────────────────────────────────────────────

  const formSchema = useMemo(() => {
    if (!pageConfig?.formConfig) return z.object({});
    const shape: Record<string, z.ZodTypeAny> = {};
    pageConfig.formConfig.fields.forEach((field) => {
      if (field.type === "hidden") return;
      let schema: z.ZodTypeAny = z.string();
      if (field.type === "email") {
        schema = z.string().email("Please enter a valid email address");
      } else if (field.required) {
        schema = z.string().min(1, `${field.label} is required`);
      } else {
        schema = z.string().optional();
      }
      shape[field.name] = schema;
    });
    return z.object(shape);
  }, [pageConfig?.formConfig]);

  const prefillValues = useMemo(
    () =>
      pageConfig?.formConfig
        ? getPrefillValues(pageConfig.formConfig.fields)
        : {},
    [pageConfig?.formConfig, getPrefillValues]
  );

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: prefillValues,
  });

  // Reset form when prefillValues change (after config loads)
  useEffect(() => {
    if (Object.keys(prefillValues).length > 0) {
      form.reset(prefillValues);
    }
  }, [prefillValues, form]);

  // Check if all required fields are pre-filled
  const allRequiredPrefilled = useMemo(() => {
    if (!pageConfig?.formConfig) return false;
    return pageConfig.formConfig.fields
      .filter((f) => f.required && f.type !== "hidden")
      .every((f) => !!prefillValues[f.name]);
  }, [pageConfig?.formConfig, prefillValues]);

  // ─── Form Start Tracking ───────────────────────────────────────────────────

  const handleFormInteraction = useCallback(() => {
    if (!formStartSentRef.current && !formStarted) {
      setFormStarted(true);
      formStartSentRef.current = true;
      const trackUrl = isPreview
        ? `/api/public/promo/${slug}/track?preview=true`
        : `/api/public/promo/${slug}/track`;
      fetch(trackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "form_start", ...utmParams }),
      }).catch(() => {});
    }
  }, [slug, utmParams, formStarted, isPreview]);

  // ─── Form Submit ────────────────────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      // Add hidden fields and UTM params
      const payload: Record<string, string> = { ...data, ...utmParams };
      if (pageConfig?.formConfig) {
        pageConfig.formConfig.fields
          .filter((f) => f.type === "hidden")
          .forEach((f) => {
            const val = f.prefillParam ? urlParams.get(f.prefillParam) || "" : "";
            payload[f.name] = val;
          });
      }
      const submitUrl = isPreview
        ? `/api/public/promo/${slug}/submit?preview=true`
        : `/api/public/promo/${slug}/submit`;
      const response = await apiRequest("POST", submitUrl, payload);
      return await response.json();
    },
    onSuccess: (result: any) => {
      // Auto-download the file directly
      if (result?.assetUrl) {
        const link = document.createElement('a');
        link.href = result.assetUrl;
        link.download = '';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setSubmitted(true);
      if (pageConfig?.thankYouConfig?.redirectUrl && pageConfig.thankYouConfig.redirectDelay) {
        setRedirectCountdown(pageConfig.thankYouConfig.redirectDelay);
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Submission failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: Record<string, string>) => {
    if (pageConfig?.formConfig?.consentRequired && !consentChecked) {
      toast({
        title: "Consent required",
        description: "Please agree to the terms before submitting.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate(data);
  };

  // ─── Redirect Countdown ────────────────────────────────────────────────────

  useEffect(() => {
    if (redirectCountdown === null || redirectCountdown <= 0) return;
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown]);

  useEffect(() => {
    if (redirectCountdown === 0 && pageConfig?.thankYouConfig?.redirectUrl) {
      window.location.href = pageConfig.thankYouConfig.redirectUrl;
    }
  }, [redirectCountdown, pageConfig?.thankYouConfig?.redirectUrl]);

  // ─── Theme & Colors ────────────────────────────────────────────────────────

  const theme = pageConfig ? getThemeClasses(pageConfig.templateTheme) : getThemeClasses("modern_gradient");
  const primaryColor = pageConfig?.brandingConfig.primaryColor || "#4F46E5";
  const accentColor = pageConfig?.brandingConfig.accentColor || "#7C3AED";
  const textColor = pageConfig?.brandingConfig.textColor;

  // ─── Countdown ──────────────────────────────────────────────────────────────

  const countdown = useCountdown(pageConfig?.urgencyConfig?.countdownEndDate);

  // ─── Computed Progress ──────────────────────────────────────────────────────

  const formProgress = useMemo(() => {
    if (!pageConfig?.formConfig?.showProgressBar) return 0;
    const fields = pageConfig.formConfig.fields.filter((f) => f.type !== "hidden");
    const values = form.getValues();
    const filled = fields.filter((f) => !!values[f.name]).length;
    return Math.round((filled / fields.length) * 100);
  }, [pageConfig?.formConfig, form]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950">
        {/* Shimmer Header */}
        <div className="h-16 border-b border-white/5 px-6 flex items-center">
          <Skeleton className="h-8 w-32 bg-white/10" />
        </div>

        {/* Shimmer Hero */}
        <div className="max-w-7xl mx-auto px-4 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
              <Skeleton className="h-14 w-full bg-white/10" />
              <Skeleton className="h-14 w-3/4 bg-white/10" />
              <Skeleton className="h-6 w-full bg-white/10" />
              <Skeleton className="h-6 w-2/3 bg-white/10" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-96 w-full rounded-2xl bg-white/10" />
            </div>
          </div>
        </div>

        {/* Shimmer Benefits */}
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl bg-white/10" />
            ))}
          </div>
        </div>

        {/* Animated gradient overlay */}
        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .skeleton-shimmer {
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
            background-size: 200% 100%;
            animation: shimmer 2s infinite;
          }
        `}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR / NOT FOUND STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (error || !pageConfig) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardHeader className="pb-4">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-slate-400" />
            </div>
            <CardTitle className="text-xl">Page Not Found</CardTitle>
            <CardDescription className="text-base">
              The page you are looking for does not exist or is no longer available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
              className="mx-auto"
            >
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THANK YOU STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (submitted && pageConfig.thankYouConfig) {
    const tyConfig = pageConfig.thankYouConfig;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareText = pageConfig.title;

    return (
      <div className={theme.page}>
        <style>{`
          @keyframes checkmark-draw {
            0% { stroke-dashoffset: 50; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes checkmark-circle {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          .checkmark-circle {
            animation: checkmark-circle 0.6s ease-out forwards;
          }
          .checkmark-check {
            stroke-dasharray: 50;
            stroke-dashoffset: 50;
            animation: checkmark-draw 0.4s ease-out 0.4s forwards;
          }
        `}</style>

        {/* Header */}
        <header className={`${theme.header} py-4 px-6`}>
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            {pageConfig.brandingConfig.logoUrl && (
              <img
                src={pageConfig.brandingConfig.logoUrl}
                alt={pageConfig.brandingConfig.companyName}
                className="h-8 object-contain"
              />
            )}
            <span className="font-semibold text-lg">
              {pageConfig.brandingConfig.companyName}
            </span>
          </div>
        </header>

        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-4">
          <div className="max-w-lg w-full text-center space-y-8">
            {/* Animated Checkmark */}
            <div className="mx-auto w-24 h-24 relative checkmark-circle">
              <svg viewBox="0 0 52 52" className="w-full h-full">
                <circle
                  cx="26"
                  cy="26"
                  r="24"
                  fill="none"
                  stroke={primaryColor}
                  strokeWidth="2"
                  opacity="0.2"
                />
                <circle
                  cx="26"
                  cy="26"
                  r="24"
                  fill={primaryColor}
                  opacity="0.1"
                />
                <path
                  className="checkmark-check"
                  fill="none"
                  stroke={primaryColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.1 27.2l7.1 7.2 16.7-16.8"
                />
              </svg>
            </div>

            <div className="space-y-3">
              <h1 className={`${pageConfig.templateTheme === "executive" ? "font-serif" : ""} text-3xl md:text-4xl font-bold`}>
                {tyConfig.headline}
              </h1>
              <p className="text-lg opacity-70 max-w-md mx-auto">
                {tyConfig.message}
              </p>
            </div>

            <div className="space-y-4">
              {tyConfig.showDownloadButton && pageConfig.assetConfig?.fileUrl && (
                <Button
                  size="lg"
                  className={`${theme.submitButton} w-full max-w-sm mx-auto text-lg py-6`}
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = pageConfig.assetConfig!.fileUrl;
                    link.download = '';
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  <Download className="mr-2 h-5 w-5" />
                  {tyConfig.downloadButtonText || "Download Again"}
                </Button>
              )}

              {tyConfig.additionalCta && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full max-w-sm mx-auto"
                  onClick={() => window.open(tyConfig.additionalCta!.url, "_blank")}
                >
                  {tyConfig.additionalCta.text}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Social Share */}
            {tyConfig.showSocialShare && (
              <div className="space-y-3 pt-4">
                <p className="text-sm opacity-50">Share this resource</p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      window.open(
                        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
                        "_blank"
                      )
                    }
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    LinkedIn
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      window.open(
                        `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
                        "_blank"
                      )
                    }
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    X / Twitter
                  </Button>
                </div>
              </div>
            )}

            {/* Redirect countdown */}
            {tyConfig.redirectUrl && redirectCountdown !== null && redirectCountdown > 0 && (
              <p className="text-sm opacity-50 animate-pulse">
                Redirecting in {redirectCountdown} second{redirectCountdown !== 1 ? "s" : ""}...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HERO BACKGROUND HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function getHeroBackground(): React.CSSProperties {
    const hc = pageConfig!.heroConfig;
    const bc = pageConfig!.brandingConfig;

    if (hc.backgroundStyle === "gradient") {
      return {
        background: hc.backgroundValue || `linear-gradient(135deg, ${bc.primaryColor}, ${bc.accentColor})`,
      };
    }
    if (hc.backgroundStyle === "image") {
      return {
        backgroundImage: `url(${hc.backgroundValue})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    if (hc.backgroundStyle === "pattern") {
      return {
        background:
          pageConfig!.templateTheme === "executive"
            ? `linear-gradient(135deg, #0f172a, #1e293b)`
            : `linear-gradient(135deg, ${bc.primaryColor}, ${bc.accentColor})`,
      };
    }
    return {
      background: `linear-gradient(135deg, ${bc.primaryColor}, ${bc.accentColor})`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM SECTION RENDERER
  // ═══════════════════════════════════════════════════════════════════════════

  function renderFormField(field: FormField) {
    if (field.type === "hidden") return null;
    const isPrefilled = !!prefillValues[field.name];
    const isMinimal = pageConfig!.templateTheme === "clean_minimal";
    const isTechForward = pageConfig!.templateTheme === "tech_forward";
    const isDarkTheme = pageConfig!.templateTheme === "executive" || pageConfig!.templateTheme === "tech_forward";

    return (
      <div
        key={field.name}
        className={`${field.halfWidth ? "" : "col-span-2"} relative`}
      >
        <Label
          htmlFor={field.name}
          className={`${theme.formLabel} block mb-1.5 text-sm`}
        >
          {field.label}
          {field.required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        <div className="relative">
          {field.type === "textarea" ? (
            <Textarea
              id={field.name}
              placeholder={field.placeholder}
              className={`${theme.formInput} min-h-[100px] transition-all duration-300 ${isPrefilled ? "opacity-80" : ""}`}
              {...form.register(field.name)}
              onFocus={handleFormInteraction}
              style={
                isTechForward
                  ? {
                      boxShadow: "none",
                    }
                  : undefined
              }
              onFocusCapture={(e) => {
                if (isTechForward) {
                  (e.target as HTMLElement).style.boxShadow = `0 0 0 2px ${accentColor}40, 0 0 20px ${accentColor}15`;
                }
              }}
              onBlurCapture={(e) => {
                if (isTechForward) {
                  (e.target as HTMLElement).style.boxShadow = "none";
                }
              }}
            />
          ) : field.type === "select" && field.options ? (
            <Select
              onValueChange={(val) => form.setValue(field.name, val)}
              defaultValue={prefillValues[field.name] || undefined}
              onOpenChange={() => handleFormInteraction()}
            >
              <SelectTrigger
                className={`${theme.formInput} w-full transition-all duration-300 ${isPrefilled ? "opacity-80" : ""}`}
              >
                <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={field.name}
              type={field.type}
              placeholder={field.placeholder}
              className={`${theme.formInput} transition-all duration-300 ${isPrefilled ? "opacity-80" : ""}`}
              {...form.register(field.name)}
              onFocus={handleFormInteraction}
              style={
                isTechForward
                  ? {
                      boxShadow: "none",
                    }
                  : undefined
              }
              onFocusCapture={(e) => {
                if (isTechForward) {
                  (e.target as HTMLElement).style.boxShadow = `0 0 0 2px ${accentColor}40, 0 0 20px ${accentColor}15`;
                }
              }}
              onBlurCapture={(e) => {
                if (isTechForward) {
                  (e.target as HTMLElement).style.boxShadow = "none";
                }
              }}
            />
          )}
          {isPrefilled && (
            <CheckCircle
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400"
            />
          )}
        </div>
        {form.formState.errors[field.name] && (
          <p className="text-red-400 text-xs mt-1">
            {form.formState.errors[field.name]?.message as string}
          </p>
        )}
      </div>
    );
  }

  function renderFormSection() {
    if (!pageConfig!.formConfig) return null;
    const fc = pageConfig!.formConfig;
    const SubmitIcon = fc.submitButtonIcon ? getIcon(fc.submitButtonIcon) : ArrowRight;

    // Compact "Confirm & Download" view when all required fields are pre-filled
    if (allRequiredPrefilled && !showEditDetails) {
      return (
        <div className={`${theme.formCard} p-6 md:p-8 space-y-4`}>
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Your details are ready</span>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            {fc.consentText && (
              <div className="flex items-start gap-3 mb-4">
                <Checkbox
                  id="consent"
                  checked={consentChecked}
                  onCheckedChange={(checked) => setConsentChecked(!!checked)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="consent"
                  className="text-xs opacity-70 cursor-pointer leading-relaxed"
                >
                  {fc.consentText}
                </label>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitMutation.isPending}
              className={`${theme.submitButton} w-full py-5 text-base`}
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
              }}
            >
              {submitMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <SubmitIcon className="mr-2 h-5 w-5" />
              )}
              {fc.submitButtonText}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setShowEditDetails(true)}
            className="text-xs opacity-50 hover:opacity-80 transition-opacity flex items-center gap-1 mx-auto mt-2"
          >
            <ChevronDown className="h-3 w-3" />
            Edit your details
          </button>
        </div>
      );
    }

    return (
      <div className={`${theme.formCard} p-6 md:p-8`}>
        {/* Animated gradient border for modern_gradient */}
        {pageConfig!.templateTheme === "modern_gradient" && (
          <div
            className="absolute inset-0 rounded-2xl -z-10 p-[2px]"
            style={{
              background: `linear-gradient(var(--gradient-angle, 0deg), ${primaryColor}, ${accentColor}, ${primaryColor})`,
              animation: "gradientRotate 4s linear infinite",
            }}
          >
            <div className="absolute inset-[2px] bg-white rounded-[14px]" />
          </div>
        )}

        <style>{`
          @keyframes gradientRotate {
            0% { --gradient-angle: 0deg; }
            100% { --gradient-angle: 360deg; }
          }
          @property --gradient-angle {
            syntax: '<angle>';
            initial-value: 0deg;
            inherits: false;
          }
        `}</style>

        {/* Progress Bar */}
        {fc.showProgressBar && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs opacity-60">
                {formProgress}% complete
              </span>
            </div>
            <Progress
              value={formProgress}
              className="h-1.5"
              style={
                {
                  "--progress-foreground": primaryColor,
                } as React.CSSProperties
              }
            />
          </div>
        )}

        {/* Collapse button if prefilled */}
        {allRequiredPrefilled && showEditDetails && (
          <button
            type="button"
            onClick={() => setShowEditDetails(false)}
            className="text-xs opacity-50 hover:opacity-80 transition-opacity flex items-center gap-1 mb-4"
          >
            <ChevronUp className="h-3 w-3" />
            Collapse details
          </button>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {fc.fields.map((field) => renderFormField(field))}
          </div>

          {/* Consent */}
          {fc.consentText && (
            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="consent"
                checked={consentChecked}
                onCheckedChange={(checked) => setConsentChecked(!!checked)}
                className="mt-0.5"
              />
              <label
                htmlFor="consent"
                className="text-xs opacity-70 cursor-pointer leading-relaxed"
              >
                {fc.consentText}
              </label>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitMutation.isPending}
            className={`${theme.submitButton} w-full py-5 text-base transition-all duration-300`}
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
            }}
          >
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <SubmitIcon className="mr-2 h-5 w-5" />
            )}
            {fc.submitButtonText}
          </Button>

          {submitMutation.isError && (
            <p className="text-red-400 text-sm text-center">
              Something went wrong. Please try again.
            </p>
          )}
        </form>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSET PREVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  function renderAssetPreview() {
    if (!pageConfig!.assetConfig) return null;
    const asset = pageConfig!.assetConfig;
    const isDark =
      pageConfig!.templateTheme === "executive" ||
      pageConfig!.templateTheme === "tech_forward" ||
      pageConfig!.templateTheme === "bold_impact";

    const AssetTypeIcon =
      asset.assetType === "video"
        ? Video
        : asset.assetType === "ebook" || asset.assetType === "book"
        ? BookOpen
        : FileText;

    return (
      <div
        className={`flex items-start gap-4 p-4 rounded-xl ${
          isDark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-100"
        }`}
      >
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            className="w-20 h-24 object-cover rounded-lg shadow-md flex-shrink-0"
          />
        ) : (
          <div
            className="w-20 h-24 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
            }}
          >
            <AssetTypeIcon className="h-8 w-8" style={{ color: primaryColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1 truncate">{asset.title}</h3>
          <p className={`text-xs mb-2 line-clamp-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {asset.description}
          </p>
          <div className={`flex items-center gap-3 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {asset.fileSize && (
              <span className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                {asset.fileSize}
              </span>
            )}
            {asset.pageCount && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {asset.pageCount} pages
              </span>
            )}
            {asset.readTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {asset.readTime}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL PROOF SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function renderSocialProof() {
    if (!pageConfig!.socialProofConfig) return null;
    const sp = pageConfig!.socialProofConfig;
    const isDark =
      pageConfig!.templateTheme === "executive" ||
      pageConfig!.templateTheme === "tech_forward" ||
      pageConfig!.templateTheme === "bold_impact";

    return (
      <section className={`py-16 md:py-24 ${pageConfig!.templateTheme === "bold_impact" ? theme.sectionBg : ""}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Stats */}
          {sp.stats && sp.stats.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
              {sp.stats.map((stat, idx) => {
                const StatIcon = stat.icon ? getIcon(stat.icon) : null;
                // Parse numeric value for animation
                const numericMatch = stat.value.match(/^([\d,]+)/);
                const numericValue = numericMatch
                  ? parseInt(numericMatch[1].replace(/,/g, ""), 10)
                  : 0;
                const suffix = stat.value.replace(/^[\d,]+/, "");

                return (
                  <StatCounter
                    key={idx}
                    numericValue={numericValue}
                    suffix={suffix}
                    label={stat.label}
                    icon={StatIcon}
                    className={theme.statCard}
                    primaryColor={primaryColor}
                    isTechForward={pageConfig!.templateTheme === "tech_forward"}
                  />
                );
              })}
            </div>
          )}

          {/* Trust Badges */}
          {sp.trustBadges && sp.trustBadges.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
              {sp.trustBadges.map((badge, idx) => {
                const BadgeIcon = getIcon(badge.icon);
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                      isDark
                        ? "bg-white/5 border border-white/10 text-slate-300"
                        : "bg-slate-50 border border-slate-200 text-slate-600"
                    }`}
                  >
                    <BadgeIcon className="h-4 w-4" style={{ color: primaryColor }} />
                    {badge.text}
                  </div>
                );
              })}
            </div>
          )}

          {/* Testimonials */}
          {sp.testimonials && sp.testimonials.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {sp.testimonials.map((testimonial, idx) => (
                <div key={idx} className={`${theme.testimonialCard} p-6 relative`}>
                  <div
                    className="absolute top-4 left-6 text-5xl font-serif opacity-20"
                    style={{ color: primaryColor }}
                  >
                    &ldquo;
                  </div>
                  <p className={`text-sm leading-relaxed mb-4 relative z-10 pt-6 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                    {testimonial.quote}
                  </p>
                  <div className="flex items-center gap-3 mt-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: primaryColor }}
                    >
                      {testimonial.authorName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{testimonial.authorName}</p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {testimonial.authorTitle}, {testimonial.authorCompany}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Company Logos */}
          {sp.companyLogos && sp.companyLogos.length > 0 && (
            <div className="text-center">
              <p className={`text-sm mb-6 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Trusted by leading companies
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
                {sp.companyLogos.map((company, idx) => (
                  <div key={idx} className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt={company.name}
                        className="h-8 md:h-10 object-contain grayscale hover:grayscale-0 transition-all duration-300"
                      />
                    ) : (
                      <span className={`text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {company.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BENEFITS SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function renderBenefits() {
    if (!pageConfig!.benefitsConfig) return null;
    const bc = pageConfig!.benefitsConfig;
    const isDark =
      pageConfig!.templateTheme === "executive" ||
      pageConfig!.templateTheme === "tech_forward";

    return (
      <section className={`py-16 md:py-24 ${theme.sectionBg}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          {(bc.sectionTitle || bc.sectionSubtitle) && (
            <div className="text-center mb-12 md:mb-16">
              {bc.sectionTitle && (
                <h2 className={`${theme.sectionTitle} mb-4`}>{bc.sectionTitle}</h2>
              )}
              {bc.sectionSubtitle && (
                <p className={`text-lg max-w-2xl mx-auto ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {bc.sectionSubtitle}
                </p>
              )}
            </div>
          )}

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {bc.items.map((item, idx) => {
              const ItemIcon = getIcon(item.icon);
              return (
                <div key={idx} className={`${theme.benefitCard} p-6 md:p-8 group`}>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
                    }}
                  >
                    <ItemIcon className="h-6 w-6" style={{ color: primaryColor }} />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // URGENCY SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function renderUrgency() {
    if (!pageConfig!.urgencyConfig?.enabled) return null;
    const uc = pageConfig!.urgencyConfig;
    const isDark =
      pageConfig!.templateTheme === "executive" ||
      pageConfig!.templateTheme === "tech_forward" ||
      pageConfig!.templateTheme === "bold_impact";

    if (uc.type === "countdown" && uc.countdownEndDate) {
      return (
        <section
          className={`py-8 ${theme.urgencyBar}`}
          style={{
            background:
              pageConfig!.templateTheme !== "executive"
                ? `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
                : undefined,
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 animate-pulse" />
                <span className="font-semibold">
                  {uc.messageTemplate || "Offer ends in:"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {[
                  { value: countdown.days, label: "Days" },
                  { value: countdown.hours, label: "Hours" },
                  { value: countdown.minutes, label: "Min" },
                  { value: countdown.seconds, label: "Sec" },
                ].map((unit, idx) => (
                  <div key={idx} className="text-center">
                    <div
                      className={`w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-bold ${
                        isDark
                          ? "bg-white/20 backdrop-blur"
                          : "bg-white/20 backdrop-blur"
                      }`}
                    >
                      {String(unit.value).padStart(2, "0")}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider mt-1 block opacity-80">
                      {unit.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (uc.type === "limited_quantity" && uc.quantityRemaining !== undefined) {
      const total = 100; // Assumed total
      const remaining = uc.quantityRemaining;
      const percent = Math.max(0, Math.min(100, (remaining / total) * 100));

      return (
        <section className={`py-6 ${theme.urgencyBar}`} style={{
          background: pageConfig!.templateTheme !== "executive"
            ? `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
            : undefined,
        }}>
          <div className="max-w-md mx-auto px-4 text-center space-y-3">
            <p className="font-semibold flex items-center justify-center gap-2">
              <Zap className="h-4 w-4 animate-pulse" />
              {uc.messageTemplate || `Only ${remaining} spots remaining!`}
            </p>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-1000"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </section>
      );
    }

    if (uc.type === "social_proof_count" && uc.recentDownloadsCount) {
      return (
        <section className={`py-4 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className={`text-sm flex items-center justify-center gap-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <Eye className="h-4 w-4" style={{ color: primaryColor }} />
              <span className="font-semibold" style={{ color: primaryColor }}>
                {uc.recentDownloadsCount.toLocaleString()}
              </span>{" "}
              {uc.messageTemplate || "people downloaded this today"}
            </p>
          </div>
        </section>
      );
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const isGated =
    pageConfig.pageType === "gated_download" ||
    pageConfig.pageType === "webinar_registration" ||
    pageConfig.pageType === "demo_request";
  const isUngated = pageConfig.pageType === "ungated_download";

  return (
    <div className={theme.page} style={textColor ? { color: textColor } : undefined}>
      {/* Tech forward geometric pattern */}
      {pageConfig.templateTheme === "tech_forward" && (
        <GeometricPatternOverlay accentColor={accentColor} />
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className={`${theme.header} py-4 px-6 relative z-20`}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          {pageConfig.brandingConfig.logoUrl && (
            <img
              src={pageConfig.brandingConfig.logoUrl}
              alt={pageConfig.brandingConfig.companyName}
              className="h-8 object-contain"
            />
          )}
          <span className={`font-semibold text-lg ${
            pageConfig.templateTheme === "executive" ? "font-serif" : ""
          }`}>
            {pageConfig.brandingConfig.companyName}
          </span>
        </div>
      </header>

      {/* ── URGENCY BAR (top position for countdown) ───────────────────────── */}
      {pageConfig.urgencyConfig?.enabled &&
        pageConfig.urgencyConfig.type === "social_proof_count" &&
        renderUrgency()}

      {/* ── HERO SECTION ───────────────────────────────────────────────────── */}
      <section
        className={`${theme.heroSection} relative z-10`}
        style={getHeroBackground()}
      >
        {/* Executive theme: subtle line decoration */}
        {pageConfig.templateTheme === "executive" && (
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-0 left-1/4 w-px h-full opacity-10"
              style={{ background: `linear-gradient(to bottom, transparent, #fbbf24, transparent)` }}
            />
            <div
              className="absolute top-0 right-1/3 w-px h-full opacity-5"
              style={{ background: `linear-gradient(to bottom, transparent, #fbbf24, transparent)` }}
            />
          </div>
        )}

        {/* Pattern overlay for 'pattern' background style */}
        {pageConfig.heroConfig.backgroundStyle === "pattern" && (
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="hero-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="1" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hero-pattern)" />
            </svg>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32 relative">
          {isGated ? (
            /* Two-column layout: Text left, Form right */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
              {/* Left Column - Content */}
              <div className="space-y-6 md:space-y-8">
                {/* Badge */}
                {pageConfig.heroConfig.badgeText && (
                  <div className="inline-block">
                    <span className={`${theme.badge} inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full`}>
                      {pageConfig.heroConfig.badgeIcon && (() => {
                        const BadgeIconComp = getIcon(pageConfig.heroConfig.badgeIcon!);
                        return <BadgeIconComp className="h-4 w-4" />;
                      })()}
                      {pageConfig.heroConfig.badgeText}
                    </span>
                  </div>
                )}

                {/* Headline */}
                <h1 className={theme.heroHeadline}>
                  {pageConfig.heroConfig.headline}
                </h1>

                {/* Sub-headline */}
                <p className={theme.heroSubheadline}>
                  {pageConfig.heroConfig.subHeadline}
                </p>

                {/* Asset Preview */}
                {renderAssetPreview()}
              </div>

              {/* Right Column - Form */}
              <div className="lg:sticky lg:top-8">
                {renderFormSection()}
              </div>
            </div>
          ) : isUngated ? (
            /* Centered layout for ungated */
            <div className="max-w-3xl mx-auto text-center space-y-8">
              {/* Badge */}
              {pageConfig.heroConfig.badgeText && (
                <div>
                  <span className={`${theme.badge} inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full`}>
                    {pageConfig.heroConfig.badgeIcon && (() => {
                      const BadgeIconComp = getIcon(pageConfig.heroConfig.badgeIcon!);
                      return <BadgeIconComp className="h-4 w-4" />;
                    })()}
                    {pageConfig.heroConfig.badgeText}
                  </span>
                </div>
              )}

              {/* Headline */}
              <h1 className={theme.heroHeadline}>
                {pageConfig.heroConfig.headline}
              </h1>

              {/* Sub-headline */}
              <p className={`${theme.heroSubheadline} mx-auto`}>
                {pageConfig.heroConfig.subHeadline}
              </p>

              {/* Asset Preview */}
              {pageConfig.assetConfig && (
                <div className="max-w-md mx-auto">
                  {renderAssetPreview()}
                </div>
              )}

              {/* Download Button */}
              {pageConfig.assetConfig?.fileUrl && (
                <Button
                  size="lg"
                  className={`${theme.submitButton} text-lg py-6 px-10 mx-auto`}
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                  }}
                  onClick={() => window.open(pageConfig.assetConfig!.fileUrl, "_blank")}
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download Now
                </Button>
              )}

              {/* Optional form for ungated */}
              {pageConfig.formConfig && (
                <div className="max-w-md mx-auto pt-8">
                  <p className="text-sm opacity-60 mb-4">
                    Enter your email for updates (optional)
                  </p>
                  {renderFormSection()}
                </div>
              )}
            </div>
          ) : (
            /* Confirmation or other types: centered */
            <div className="max-w-3xl mx-auto text-center space-y-8">
              {pageConfig.heroConfig.badgeText && (
                <div>
                  <span className={`${theme.badge} inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full`}>
                    {pageConfig.heroConfig.badgeText}
                  </span>
                </div>
              )}
              <h1 className={theme.heroHeadline}>
                {pageConfig.heroConfig.headline}
              </h1>
              <p className={`${theme.heroSubheadline} mx-auto`}>
                {pageConfig.heroConfig.subHeadline}
              </p>
              {pageConfig.formConfig && (
                <div className="max-w-lg mx-auto">
                  {renderFormSection()}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── URGENCY (countdown/limited) ────────────────────────────────────── */}
      {pageConfig.urgencyConfig?.enabled &&
        pageConfig.urgencyConfig.type !== "social_proof_count" &&
        renderUrgency()}

      {/* ── BENEFITS ───────────────────────────────────────────────────────── */}
      {renderBenefits()}

      {/* ── SOCIAL PROOF ───────────────────────────────────────────────────── */}
      {renderSocialProof()}

      {/* ── BOLD IMPACT: Floating Mobile CTA ───────────────────────────────── */}
      {pageConfig.templateTheme === "bold_impact" && isGated && pageConfig.formConfig && (
        <div className={theme.floatingCta}>
          <Button
            className="w-full py-4 font-bold uppercase tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
              color: "white",
            }}
            onClick={() => {
              document.querySelector("form")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          >
            {pageConfig.formConfig.submitButtonText}
          </Button>
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className={`${theme.footer} py-8 px-6`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <span>
            &copy; {new Date().getFullYear()} {pageConfig.brandingConfig.companyName}. All rights reserved.
          </span>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:underline opacity-60 hover:opacity-100 transition-opacity">
              Privacy Policy
            </a>
            <span className="opacity-30">|</span>
            <span className="opacity-40 text-xs">
              Powered by DemandGentic
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Stat Counter Sub-component ─────────────────────────────────────────────

function StatCounter({
  numericValue,
  suffix,
  label,
  icon: Icon,
  className,
  primaryColor,
  isTechForward,
}: {
  numericValue: number;
  suffix: string;
  label: string;
  icon: LucideIcon | null;
  className: string;
  primaryColor: string;
  isTechForward: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const animatedValue = useAnimatedCounter(numericValue, 2000, isVisible);

  return (
    <div ref={ref} className={`${className} p-6 text-center`}>
      {Icon && (
        <Icon className="h-6 w-6 mx-auto mb-3" style={{ color: primaryColor }} />
      )}
      <div className={`text-3xl md:text-4xl font-bold mb-1 ${isTechForward ? "font-mono" : ""}`}>
        {numericValue > 0 ? animatedValue.toLocaleString() : "0"}
        {suffix}
      </div>
      <div className="text-sm opacity-60">{label}</div>
    </div>
  );
}
