import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { SUPER_ORG_ID, SUPER_ORG_NAME } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Image as ImageIcon,
  Building2,
  Globe,
  Mail,
  MessageSquare,
  FileText,
  BookOpen,
  Briefcase,
  History,
  Sparkles,
  Brain,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  ShieldCheck,
} from "lucide-react";
import ImageGenerationTab from "@/components/generative-studio/image-generation-tab";
import LandingPageTab from "@/components/generative-studio/landing-page-tab";
import EmailTemplateTab from "@/components/generative-studio/email-template-tab";
import ChatTab from "@/components/generative-studio/chat-tab";
import BlogPostTab from "@/components/generative-studio/blog-post-tab";
import EbookTab from "@/components/generative-studio/ebook-tab";
import SolutionBriefTab from "@/components/generative-studio/solution-brief-tab";
import ProjectHistoryPanel from "@/components/generative-studio/shared/project-history-panel";
import StudioGovernancePanel from "@/components/content-governance/studio-governance-panel";

export interface OrgIntelligenceProfile {
  domain?: string;
  identity?: {
    legalName?: { value?: string };
    description?: { value?: string };
    industry?: { value?: string };
    employees?: { value?: string };
    regions?: { value?: string };
  };
  offerings?: {
    coreProducts?: { value?: string };
    useCases?: { value?: string };
    problemsSolved?: { value?: string };
    differentiators?: { value?: string };
  };
  icp?: {
    industries?: { value?: string };
    personas?: { value?: string };
    objections?: { value?: string };
  };
  positioning?: {
    oneLiner?: { value?: string };
    competitors?: { value?: string };
    whyUs?: { value?: string };
  };
  outreach?: {
    emailAngles?: { value?: string };
    callOpeners?: { value?: string };
  };
  branding?: {
    tone?: { value?: string };
    keywords?: { value?: string };
    forbiddenTerms?: { value?: string };
    communicationStyle?: { value?: string };
    primaryColor?: { value?: string };
    secondaryColor?: { value?: string };
  };
  events?: {
    upcoming?: string | { value?: string };
    strategy?: string | { value?: string };
  };
  forums?: {
    list?: string | { value?: string };
    engagement_strategy?: string | { value?: string };
  };
}

function getIntelValue(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.value || "";
}

const MODULES = [
  {
    id: "image",
    label: "Images",
    shortLabel: "Images",
    icon: ImageIcon,
    color: "violet",
    description: "AI image generation",
    bgClass: "bg-violet-500/10",
    textClass: "text-violet-600",
    activeClass: "bg-violet-500/10 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
  },
  {
    id: "landing-page",
    label: "Landing Pages",
    shortLabel: "Pages",
    icon: Globe,
    color: "blue",
    description: "Generate & publish pages",
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-600",
    activeClass: "bg-blue-500/10 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
  },
  {
    id: "email",
    label: "Email Templates",
    shortLabel: "Emails",
    icon: Mail,
    color: "emerald",
    description: "Professional email templates",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-600",
    activeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  {
    id: "blog",
    label: "Blog Posts",
    shortLabel: "Blogs",
    icon: FileText,
    color: "orange",
    description: "SEO-optimized blog posts",
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-600",
    activeClass: "bg-orange-500/10 text-orange-700 border-orange-200",
    dotClass: "bg-orange-500",
  },
  {
    id: "ebook",
    label: "eBooks",
    shortLabel: "eBooks",
    icon: BookOpen,
    color: "rose",
    description: "Multi-chapter eBooks",
    bgClass: "bg-rose-500/10",
    textClass: "text-rose-600",
    activeClass: "bg-rose-500/10 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
  },
  {
    id: "solution-brief",
    label: "Solution Briefs",
    shortLabel: "Briefs",
    icon: Briefcase,
    color: "teal",
    description: "Professional solution briefs",
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-600",
    activeClass: "bg-teal-500/10 text-teal-700 border-teal-200",
    dotClass: "bg-teal-500",
  },
  {
    id: "chat",
    label: "Chat Assistant",
    shortLabel: "Chat",
    icon: MessageSquare,
    color: "amber",
    description: "Content strategy assistant",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-600",
    activeClass: "bg-amber-500/10 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
  },
  {
    id: "governance",
    label: "Content Governance",
    shortLabel: "Govern",
    icon: ShieldCheck,
    color: "cyan",
    description: "Feature registry, page health & design governance",
    bgClass: "bg-cyan-500/10",
    textClass: "text-cyan-600",
    activeClass: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
    dotClass: "bg-cyan-500",
  },
] as const;

export default function GenerativeStudioPage() {
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const moduleFromUrl = searchParams.get("module");
  const campaignIdFromUrl = searchParams.get("campaignId");
  const projectIdFromUrl = searchParams.get("clientProjectId") || searchParams.get("projectId");

  const [activeModule, setActiveModule] = useState("image");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Client Portal: default to null (will be set from API); Admin: default to Pivotal B2B super org
  // Only treat as client portal if we're actually on a client portal page — prevents stale tokens from breaking admin mode
  const isClientPortalPage = window.location.pathname.startsWith('/client-portal');
  const clientPortalToken = isClientPortalPage ? localStorage.getItem("clientPortalToken") : null;
  const [selectedOrgId, setSelectedOrgId] = useState(clientPortalToken ? null : SUPER_ORG_ID);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Client Portal Integration
  const { data: clientOrgData, isLoading: clientOrgLoading } = useQuery({
    queryKey: ["client-portal-org-simple"],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/organization-intelligence', {
        headers: { Authorization: `Bearer ${clientPortalToken}` }
      });
      if (!res.ok) throw new Error("Failed to fetch client org");
      return res.json();
    },
    enabled: !!clientPortalToken
  });

  useEffect(() => {
    if (clientPortalToken && clientOrgData?.organization?.id) {
      setSelectedOrgId(clientOrgData.organization.id);
    }
  }, [clientPortalToken, clientOrgData]);

  const { data: brandKitsData } = useQuery({
    queryKey: ['brandKits'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/email-builder/brand-kits');
      const data = await res.json();
      return Array.isArray(data) ? { brandKits: data } : data;
    },
  });

  const brandKits = (brandKitsData as any)?.brandKits || (Array.isArray(brandKitsData) ? brandKitsData : []);

  useEffect(() => {
    if (moduleFromUrl && MODULES.some((m) => m.id === moduleFromUrl)) {
      setActiveModule(moduleFromUrl);
    }
  }, [moduleFromUrl]);

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  // Auto-resolve organization + project type from projectId in URL
  const { data: resolvedOrgData } = useQuery({
    queryKey: [`/api/generative-studio/resolve-project-org?projectId=${projectIdFromUrl || ""}`],
    enabled: !!projectIdFromUrl,
  });

  // Track the resolved studio project ID for auto-loading content
  const [preloadStudioProjectId, setPreloadStudioProjectId] = useState(null);

  useEffect(() => {
    if (!resolvedOrgData) return;
    // If the URL points to a generative studio project, auto-switch to the right tab
    if (resolvedOrgData.source === "generative_studio" && resolvedOrgData.studioProjectId) {
      setPreloadStudioProjectId(resolvedOrgData.studioProjectId);
      // Map project type to module tab
      const typeToModule: Record = {
        landing_page: "landing-page",
        email_template: "email",
        blog_post: "blog",
        ebook: "ebook",
        solution_brief: "solution-brief",
      };
      const moduleId = typeToModule[resolvedOrgData.studioProjectType || ""] || "landing-page";
      setActiveModule(moduleId);
      // Also set the client project from metadata if available
      if (resolvedOrgData.clientProjectId) {
        setSelectedProjectId(resolvedOrgData.clientProjectId);
      }
    }
  }, [clientPortalToken, resolvedOrgData]);

  useEffect(() => {
    if (clientPortalToken) return;
    if (selectedOrgId) {
      localStorage.setItem("generativeStudioOrgId", selectedOrgId);
      // Don't override project from URL
      if (!projectIdFromUrl) {
        const storedProjectId = localStorage.getItem(`generativeStudioProjectId:${selectedOrgId}`);
        setSelectedProjectId(storedProjectId || null);
      }
    } else {
      localStorage.removeItem("generativeStudioOrgId");
      if (!projectIdFromUrl) {
        setSelectedProjectId(null);
      }
    }
  }, [clientPortalToken, projectIdFromUrl, selectedOrgId]);

  useEffect(() => {
    if (clientPortalToken) return;
    if (!selectedOrgId) return;
    if (selectedProjectId) {
      localStorage.setItem(`generativeStudioProjectId:${selectedOrgId}`, selectedProjectId);
    } else {
      localStorage.removeItem(`generativeStudioProjectId:${selectedOrgId}`);
    }
  }, [clientPortalToken, selectedOrgId, selectedProjectId]);

  const { data: orgProjectsData, isLoading: orgProjectsLoading } = useQuery({
    queryKey: [
      `/api/generative-studio/org-projects?organizationId=${selectedOrgId || ""}`,
    ],
    enabled: !!selectedOrgId,
  });

  const orgProjects = orgProjectsData?.projects || [];

  useEffect(() => {
    if (!selectedOrgId) return;
    if (selectedProjectId && orgProjects.some((p) => p.id === selectedProjectId)) return;
    // Don't replace URL project while projects are still loading
    if (projectIdFromUrl && selectedProjectId === projectIdFromUrl && orgProjects.length === 0) return;
    setSelectedProjectId(orgProjects[0]?.id || null);
  }, [selectedOrgId, selectedProjectId, orgProjects]);

  const { data: orgIntelData, isLoading: orgIntelLoading } = useQuery({
    queryKey: [
      `/api/org-intelligence/profile?organizationId=${selectedOrgId || ""}`,
    ],
    staleTime: 5 * 60 * 1000,
    // Skip admin OI fetch in client portal mode — OI comes from clientOrgData instead
    enabled: !!selectedOrgId && !clientPortalToken,
  });

  // In client portal mode, derive OI profile from the client org data
  const orgProfile: OrgIntelligenceProfile | null = clientPortalToken
    ? (clientOrgData?.organization
        ? {
            identity: clientOrgData.organization.identity,
            offerings: clientOrgData.organization.offerings,
            icp: clientOrgData.organization.icp,
            positioning: clientOrgData.organization.positioning,
            outreach: clientOrgData.organization.outreach,
            events: clientOrgData.organization.events,
            forums: clientOrgData.organization.forums,
          } as OrgIntelligenceProfile
        : null)
    : (orgIntelData?.profile || null);
  // getIntelValue handles both { value: "..." } (admin-analyzed) and flat string (client-portal-analyzed)
  const hasOrgIntel = !!getIntelValue(orgProfile?.identity?.legalName);
  const needsOrgSelection = !selectedOrgId;

  const orgSummary = orgProfile
    ? [
        getIntelValue(orgProfile.identity?.legalName) && `Company: ${getIntelValue(orgProfile.identity?.legalName)}`,
        getIntelValue(orgProfile.identity?.industry) && `Industry: ${getIntelValue(orgProfile.identity?.industry)}`,
        getIntelValue(orgProfile.icp?.personas) && `Target Personas: ${getIntelValue(orgProfile.icp?.personas)}`,
        getIntelValue(orgProfile.positioning?.oneLiner) && `Positioning: ${getIntelValue(orgProfile.positioning?.oneLiner)}`,
        getIntelValue(orgProfile.events?.upcoming) && `Events: ${getIntelValue(orgProfile.events?.upcoming)}`,
        getIntelValue(orgProfile.forums?.list) && `Communities: ${getIntelValue(orgProfile.forums?.list)}`,
      ].filter(Boolean).join("\n")
    : "";

  const selectedProject = useMemo(
    () => orgProjects.find((project) => project.id === selectedProjectId),
    [orgProjects, selectedProjectId]
  );

  const hasScope = !!selectedOrgId;
  // OI is mandatory — generation is blocked without it
  const effectiveOiLoading = clientPortalToken ? clientOrgLoading : orgIntelLoading;
  const oiMissing = !hasOrgIntel && !!selectedOrgId && !effectiveOiLoading;

  const currentModule = MODULES.find((m) => m.id === activeModule) || MODULES[0];

  return (
    
      {/* Compact Top Bar */}
      
        
          
            
          
          
            Creative Studio
            AI-powered content creation
          
        

        
          {/* Org/Project Context - Compact */}
          
            {clientPortalToken ? (
              
                
                
                  {clientOrgData?.organization?.name || "Loading..."}
                
                Client
              
            ) : (
              
                
                {SUPER_ORG_NAME}
                Super Org
              
            )}
             setSelectedProjectId(value || null)}
              disabled={!selectedOrgId || orgProjectsLoading}
            >
              
                
                
              
              
                {orgProjects.map((project) => (
                  
                    {project.name}
                  
                ))}
                {orgProjects.length === 0 && (
                  
                    No projects available
                  
                )}
              
            
          

          {/* Org Intelligence Badge */}
          
            
              
                
                  {needsOrgSelection ? (
                    
                  ) : effectiveOiLoading ? (
                    
                  ) : hasOrgIntel ? (
                    
                  ) : (
                    
                  )}
                  
                    {needsOrgSelection
                      ? "Select Org"
                      : effectiveOiLoading
                      ? "Loading..."
                      : hasOrgIntel
                      ? "OI Active"
                      : "No OI"}
                  
                
              
              
                {needsOrgSelection ? (
                  
                    Select an organization to activate organization-specific intelligence.
                  
                ) : hasOrgIntel ? (
                  
                    Organization Intelligence is enhancing all generations
                    {orgSummary}
                  
                ) : (
                  
                    No organization intelligence profile found. Go to AI Studio &gt; Organization Intelligence to analyze.
                  
                )}
              
            
          

          {/* History Button */}
          
            
              
                
              
            
            
              
            
          
        
      

      {/* Mandatory OI Gate */}
      {!hasScope && (
        
          
          Organization required. Select an organization above to unlock Creative Studio. All outputs must be derived from Organizational Intelligence.
        
      )}
      {oiMissing && (
        
          
          Organizational Intelligence profile incomplete. Go to AI Studio &gt; Organization Intelligence to analyze and complete the profile before generating content.
        
      )}

      {/* Main Content: Sidebar + Module */}
      
        {/* Sidebar Navigation */}
        
          
            
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                const isActive = activeModule === mod.id;
                return (
                  
                    
                      
                         setActiveModule(mod.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
                            "hover:bg-accent/60",
                            isActive
                              ? cn(mod.activeClass, "border shadow-sm")
                              : "text-muted-foreground border border-transparent"
                          )}
                        >
                          
                            
                          
                          {!sidebarCollapsed && (
                            <>
                              {mod.label}
                              {isActive && (
                                
                              )}
                            
                          )}
                        
                      
                      {sidebarCollapsed && (
                        
                          {mod.label}
                          {mod.description}
                        
                      )}
                    
                  
                );
              })}
            
          

          {/* Sidebar Collapse Toggle */}
          
             setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                
              ) : (
                
              )}
            
          
        

        {/* Module Content Area */}
        
          {activeModule === "image" && (
            
          )}
          {activeModule === "landing-page" && (
            
          )}
          {activeModule === "email" && (
            
          )}
          {activeModule === "blog" && (
            
          )}
          {activeModule === "ebook" && (
            
          )}
          {activeModule === "solution-brief" && (
            
          )}
          {activeModule === "chat" && (
            
          )}
          {activeModule === "governance" && (
            
          )}
        
      
    
  );
}