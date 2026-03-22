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
    stats?: Array;
    testimonials?: Array;
    companyLogos?: Array;
    trustBadges?: Array;
  };
  benefitsConfig?: {
    sectionTitle?: string;
    sectionSubtitle?: string;
    items: Array;
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

const ICON_MAP: Record = {
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
        header: "bg-transparent absolute top-0 left-0 right-0 z-20",
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
      if (progress  cancelAnimationFrame(animationFrame);
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
  const { slug } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [submitted, setSubmitted] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(null);
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

  const { data: pageConfig, isLoading, error } = useQuery({
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
      const values: Record = {};
      const standardParams: Record = {
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
    const shape: Record = {};
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
    mutationFn: async (data: Record) => {
      // Add hidden fields and UTM params
      const payload: Record = { ...data, ...utmParams };
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

  const onSubmit = (data: Record) => {
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
    if (redirectCountdown === null || redirectCountdown  {
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
      
        {/* Shimmer Header */}
        
          
        

        {/* Shimmer Hero */}
        
          
            
              
              
              
              
              
            
            
              
            
          
        

        {/* Shimmer Benefits */}
        
          
            {[1, 2, 3].map((i) => (
              
            ))}
          
        

        {/* Animated gradient overlay */}
        {`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .skeleton-shimmer {
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
            background-size: 200% 100%;
            animation: shimmer 2s infinite;
          }
        `}
      
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR / NOT FOUND STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (error || !pageConfig) {
    return (
      
        
          
            
              
            
            Page Not Found
            
              The page you are looking for does not exist or is no longer available.
            
          
          
             setLocation("/")}
              className="mx-auto"
            >
              Go to Homepage
            
          
        
      
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
      
        {`
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
        `}

        {/* Header */}
        
          
            {pageConfig.brandingConfig.logoUrl && (
              
            )}
            
              {pageConfig.brandingConfig.companyName}
            
          
        

        
          
            {/* Animated Checkmark */}
            
              
                
                
                
              
            

            
              
                {tyConfig.headline}
              
              
                {tyConfig.message}
              
            

            
              {tyConfig.showDownloadButton && pageConfig.assetConfig?.fileUrl && (
                 {
                    const link = document.createElement('a');
                    link.href = pageConfig.assetConfig!.fileUrl;
                    link.download = '';
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  
                  {tyConfig.downloadButtonText || "Download Again"}
                
              )}

              {tyConfig.additionalCta && (
                 window.open(tyConfig.additionalCta!.url, "_blank")}
                >
                  {tyConfig.additionalCta.text}
                  
                
              )}
            

            {/* Social Share */}
            {tyConfig.showSocialShare && (
              
                Share this resource
                
                  
                      window.open(
                        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
                        "_blank"
                      )
                    }
                  >
                    
                    LinkedIn
                  
                  
                      window.open(
                        `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
                        "_blank"
                      )
                    }
                  >
                    
                    X / Twitter
                  
                
              
            )}

            {/* Redirect countdown */}
            {tyConfig.redirectUrl && redirectCountdown !== null && redirectCountdown > 0 && (
              
                Redirecting in {redirectCountdown} second{redirectCountdown !== 1 ? "s" : ""}...
              
            )}
          
        
      
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
      
        
          {field.label}
          {field.required && *}
        
        
          {field.type === "textarea" ? (
             {
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
             form.setValue(field.name, val)}
              defaultValue={prefillValues[field.name] || undefined}
              onOpenChange={() => handleFormInteraction()}
            >
              
                
              
              
                {field.options.map((option) => (
                  
                    {option}
                  
                ))}
              
            
          ) : (
             {
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
            
          )}
        
        {form.formState.errors[field.name] && (
          
            {form.formState.errors[field.name]?.message as string}
          
        )}
      
    );
  }

  function renderFormSection() {
    if (!pageConfig!.formConfig) return null;
    const fc = pageConfig!.formConfig;
    const SubmitIcon = fc.submitButtonIcon ? getIcon(fc.submitButtonIcon) : ArrowRight;

    // Compact "Confirm & Download" view when all required fields are pre-filled
    if (allRequiredPrefilled && !showEditDetails) {
      return (
        
          
            
            Your details are ready
          

          
            {fc.consentText && (
              
                 setConsentChecked(!!checked)}
                  className="mt-0.5"
                />
                
                  {fc.consentText}
                
              
            )}

            
              {submitMutation.isPending ? (
                
              ) : (
                
              )}
              {fc.submitButtonText}
            
          

           setShowEditDetails(true)}
            className="text-xs opacity-50 hover:opacity-80 transition-opacity flex items-center gap-1 mx-auto mt-2"
          >
            
            Edit your details
          
        
      );
    }

    return (
      
        {/* Animated gradient border for modern_gradient */}
        {pageConfig!.templateTheme === "modern_gradient" && (
          
            
          
        )}

        {`
          @keyframes gradientRotate {
            0% { --gradient-angle: 0deg; }
            100% { --gradient-angle: 360deg; }
          }
          @property --gradient-angle {
            syntax: '';
            initial-value: 0deg;
            inherits: false;
          }
        `}

        {/* Progress Bar */}
        {fc.showProgressBar && (
          
            
              
                {formProgress}% complete
              
            
            
          
        )}

        {/* Collapse button if prefilled */}
        {allRequiredPrefilled && showEditDetails && (
           setShowEditDetails(false)}
            className="text-xs opacity-50 hover:opacity-80 transition-opacity flex items-center gap-1 mb-4"
          >
            
            Collapse details
          
        )}

        
          
            {fc.fields.map((field) => renderFormField(field))}
          

          {/* Consent */}
          {fc.consentText && (
            
               setConsentChecked(!!checked)}
                className="mt-0.5"
              />
              
                {fc.consentText}
              
            
          )}

          {/* Submit Button */}
          
            {submitMutation.isPending ? (
              
            ) : (
              
            )}
            {fc.submitButtonText}
          

          {submitMutation.isError && (
            
              Something went wrong. Please try again.
            
          )}
        
      
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
      
        {asset.thumbnailUrl ? (
          
        ) : (
          
            
          
        )}
        
          {asset.title}
          
            {asset.description}
          
          
            {asset.fileSize && (
              
                
                {asset.fileSize}
              
            )}
            {asset.pageCount && (
              
                
                {asset.pageCount} pages
              
            )}
            {asset.readTime && (
              
                
                {asset.readTime}
              
            )}
          
        
      
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
      
        
          {/* Stats */}
          {sp.stats && sp.stats.length > 0 && (
            
              {sp.stats.map((stat, idx) => {
                const StatIcon = stat.icon ? getIcon(stat.icon) : null;
                // Parse numeric value for animation
                const numericMatch = stat.value.match(/^([\d,]+)/);
                const numericValue = numericMatch
                  ? parseInt(numericMatch[1].replace(/,/g, ""), 10)
                  : 0;
                const suffix = stat.value.replace(/^[\d,]+/, "");

                return (
                  
                );
              })}
            
          )}

          {/* Trust Badges */}
          {sp.trustBadges && sp.trustBadges.length > 0 && (
            
              {sp.trustBadges.map((badge, idx) => {
                const BadgeIcon = getIcon(badge.icon);
                return (
                  
                    
                    {badge.text}
                  
                );
              })}
            
          )}

          {/* Testimonials */}
          {sp.testimonials && sp.testimonials.length > 0 && (
            
              {sp.testimonials.map((testimonial, idx) => (
                
                  
                    &ldquo;
                  
                  
                    {testimonial.quote}
                  
                  
                    
                      {testimonial.authorName.charAt(0)}
                    
                    
                      {testimonial.authorName}
                      
                        {testimonial.authorTitle}, {testimonial.authorCompany}
                      
                    
                  
                
              ))}
            
          )}

          {/* Company Logos */}
          {sp.companyLogos && sp.companyLogos.length > 0 && (
            
              
                Trusted by leading companies
              
              
                {sp.companyLogos.map((company, idx) => (
                  
                    {company.logoUrl ? (
                      
                    ) : (
                      
                        {company.name}
                      
                    )}
                  
                ))}
              
            
          )}
        
      
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
      
        
          {/* Section Header */}
          {(bc.sectionTitle || bc.sectionSubtitle) && (
            
              {bc.sectionTitle && (
                {bc.sectionTitle}
              )}
              {bc.sectionSubtitle && (
                
                  {bc.sectionSubtitle}
                
              )}
            
          )}

          {/* Benefits Grid */}
          
            {bc.items.map((item, idx) => {
              const ItemIcon = getIcon(item.icon);
              return (
                
                  
                    
                  
                  {item.title}
                  
                    {item.description}
                  
                
              );
            })}
          
        
      
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
        
          
            
              
                
                
                  {uc.messageTemplate || "Offer ends in:"}
                
              
              
                {[
                  { value: countdown.days, label: "Days" },
                  { value: countdown.hours, label: "Hours" },
                  { value: countdown.minutes, label: "Min" },
                  { value: countdown.seconds, label: "Sec" },
                ].map((unit, idx) => (
                  
                    
                      {String(unit.value).padStart(2, "0")}
                    
                    
                      {unit.label}
                    
                  
                ))}
              
            
          
        
      );
    }

    if (uc.type === "limited_quantity" && uc.quantityRemaining !== undefined) {
      const total = 100; // Assumed total
      const remaining = uc.quantityRemaining;
      const percent = Math.max(0, Math.min(100, (remaining / total) * 100));

      return (
        
          
            
              
              {uc.messageTemplate || `Only ${remaining} spots remaining!`}
            
            
              
            
          
        
      );
    }

    if (uc.type === "social_proof_count" && uc.recentDownloadsCount) {
      return (
        
          
            
              
              
                {uc.recentDownloadsCount.toLocaleString()}
              {" "}
              {uc.messageTemplate || "people downloaded this today"}
            
          
        
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
    
      {/* Tech forward geometric pattern */}
      {pageConfig.templateTheme === "tech_forward" && (
        
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      
        
          {pageConfig.brandingConfig.logoUrl && (
            
          )}
          
            {pageConfig.brandingConfig.companyName}
          
        
      

      {/* ── URGENCY BAR (top position for countdown) ───────────────────────── */}
      {pageConfig.urgencyConfig?.enabled &&
        pageConfig.urgencyConfig.type === "social_proof_count" &&
        renderUrgency()}

      {/* ── HERO SECTION ───────────────────────────────────────────────────── */}
      
        {/* Executive theme: subtle line decoration */}
        {pageConfig.templateTheme === "executive" && (
          
            
            
          
        )}

        {/* Pattern overlay for 'pattern' background style */}
        {pageConfig.heroConfig.backgroundStyle === "pattern" && (
          
            
              
                
                  
                
              
              
            
          
        )}

        
          {isGated ? (
            /* Two-column layout: Text left, Form right */
            
              {/* Left Column - Content */}
              
                {/* Badge */}
                {pageConfig.heroConfig.badgeText && (
                  
                    
                      {pageConfig.heroConfig.badgeIcon && (() => {
                        const BadgeIconComp = getIcon(pageConfig.heroConfig.badgeIcon!);
                        return ;
                      })()}
                      {pageConfig.heroConfig.badgeText}
                    
                  
                )}

                {/* Headline */}
                
                  {pageConfig.heroConfig.headline}
                

                {/* Sub-headline */}
                
                  {pageConfig.heroConfig.subHeadline}
                

                {/* Asset Preview */}
                {renderAssetPreview()}
              

              {/* Right Column - Form */}
              
                {renderFormSection()}
              
            
          ) : isUngated ? (
            /* Centered layout for ungated */
            
              {/* Badge */}
              {pageConfig.heroConfig.badgeText && (
                
                  
                    {pageConfig.heroConfig.badgeIcon && (() => {
                      const BadgeIconComp = getIcon(pageConfig.heroConfig.badgeIcon!);
                      return ;
                    })()}
                    {pageConfig.heroConfig.badgeText}
                  
                
              )}

              {/* Headline */}
              
                {pageConfig.heroConfig.headline}
              

              {/* Sub-headline */}
              
                {pageConfig.heroConfig.subHeadline}
              

              {/* Asset Preview */}
              {pageConfig.assetConfig && (
                
                  {renderAssetPreview()}
                
              )}

              {/* Download Button */}
              {pageConfig.assetConfig?.fileUrl && (
                 window.open(pageConfig.assetConfig!.fileUrl, "_blank")}
                >
                  
                  Download Now
                
              )}

              {/* Optional form for ungated */}
              {pageConfig.formConfig && (
                
                  
                    Enter your email for updates (optional)
                  
                  {renderFormSection()}
                
              )}
            
          ) : (
            /* Confirmation or other types: centered */
            
              {pageConfig.heroConfig.badgeText && (
                
                  
                    {pageConfig.heroConfig.badgeText}
                  
                
              )}
              
                {pageConfig.heroConfig.headline}
              
              
                {pageConfig.heroConfig.subHeadline}
              
              {pageConfig.formConfig && (
                
                  {renderFormSection()}
                
              )}
            
          )}
        
      

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
        
           {
              document.querySelector("form")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          >
            {pageConfig.formConfig.submitButtonText}
          
        
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      
        
          
            &copy; {new Date().getFullYear()} {pageConfig.brandingConfig.companyName}. All rights reserved.
          
          
            
              Privacy Policy
            
            |
            
              Powered by DemandGentic
            
          
        
      
    
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
  const ref = useRef(null);

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
    
      {Icon && (
        
      )}
      
        {numericValue > 0 ? animatedValue.toLocaleString() : "0"}
        {suffix}
      
      {label}
    
  );
}