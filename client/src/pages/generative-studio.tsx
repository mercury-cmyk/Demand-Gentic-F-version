import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
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
} from "lucide-react";
import ImageGenerationTab from "@/components/generative-studio/image-generation-tab";
import LandingPageTab from "@/components/generative-studio/landing-page-tab";
import EmailTemplateTab from "@/components/generative-studio/email-template-tab";
import ChatTab from "@/components/generative-studio/chat-tab";
import BlogPostTab from "@/components/generative-studio/blog-post-tab";
import EbookTab from "@/components/generative-studio/ebook-tab";
import SolutionBriefTab from "@/components/generative-studio/solution-brief-tab";
import ProjectHistoryPanel from "@/components/generative-studio/shared/project-history-panel";
import { OrganizationSelector } from "@/components/ai-studio/org-intelligence/organization-selector";

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
] as const;

export default function GenerativeStudioPage() {
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const moduleFromUrl = searchParams.get("module");
  const campaignIdFromUrl = searchParams.get("campaignId");
  const orgIdFromUrl = searchParams.get("organizationId");
  const projectIdFromUrl = searchParams.get("clientProjectId") || searchParams.get("projectId");

  const [activeModule, setActiveModule] = useState("image");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Client Portal Integration
  const clientPortalToken = localStorage.getItem("clientPortalToken");
  const { data: clientOrgData } = useQuery<{
    organization: { id: string; name: string } | null;
  }>({
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

  const { data: brandKitsData } = useQuery<{ brandKits?: any[] } | any[]>({
    queryKey: ['brandKits'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/email-builder/brand-kits');
      const data = await res.json();
      return Array.isArray(data) ? { brandKits: data } : data;
    },
  });

  const brandKits = (brandKitsData as any)?.brandKits || (Array.isArray(brandKitsData) ? brandKitsData : []);

  // Skip localStorage org restoration when URL has a projectId to resolve
  useEffect(() => {
    if (projectIdFromUrl) return;
    const storedOrgId = localStorage.getItem("generativeStudioOrgId");
    if (storedOrgId) {
      setSelectedOrgId(storedOrgId);
    }
  }, []);

  useEffect(() => {
    if (moduleFromUrl && MODULES.some((m) => m.id === moduleFromUrl)) {
      setActiveModule(moduleFromUrl);
    }
  }, [moduleFromUrl]);

  useEffect(() => {
    if (orgIdFromUrl) {
      setSelectedOrgId(orgIdFromUrl);
    }
  }, [orgIdFromUrl]);

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  // Auto-resolve organization from project when projectId is in URL
  const { data: resolvedOrgData } = useQuery<{ organizationId: string | null }>({
    queryKey: [`/api/generative-studio/resolve-project-org?projectId=${projectIdFromUrl || ""}`],
    enabled: !!projectIdFromUrl && !orgIdFromUrl,
  });

  useEffect(() => {
    if (resolvedOrgData?.organizationId) {
      setSelectedOrgId(resolvedOrgData.organizationId);
    }
  }, [resolvedOrgData]);

  useEffect(() => {
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
  }, [selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    if (selectedProjectId) {
      localStorage.setItem(`generativeStudioProjectId:${selectedOrgId}`, selectedProjectId);
    } else {
      localStorage.removeItem(`generativeStudioProjectId:${selectedOrgId}`);
    }
  }, [selectedOrgId, selectedProjectId]);

  const { data: orgProjectsData, isLoading: orgProjectsLoading } = useQuery<{
    projects: { id: string; name: string; status?: string }[];
  }>({
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

  const { data: orgIntelData, isLoading: orgIntelLoading } = useQuery<{
    success?: boolean;
    profile: OrgIntelligenceProfile | null;
    metadata?: { confidenceScore?: number; modelVersion?: string; updatedAt?: string };
  }>({
    queryKey: [
      `/api/org-intelligence/profile?organizationId=${selectedOrgId || ""}`,
    ],
    staleTime: 5 * 60 * 1000,
    enabled: !!selectedOrgId,
  });

  const orgProfile = orgIntelData?.profile || null;
  const hasOrgIntel = !!orgProfile?.identity?.legalName?.value;
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

  const currentModule = MODULES.find((m) => m.id === activeModule) || MODULES[0];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Compact Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight leading-none">Creative Studio</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">AI-powered content creation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Org/Project Context - Compact */}
          <div className="flex items-center gap-2 mr-1">
            <OrganizationSelector
              selectedOrgId={selectedOrgId}
              onOrgChange={setSelectedOrgId}
              disabled={!!clientPortalToken}
            />
            <Select
              value={selectedProjectId || ""}
              onValueChange={(value) => setSelectedProjectId(value || null)}
              disabled={!selectedOrgId || orgProjectsLoading}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <FolderKanban className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue
                  placeholder={
                    orgProjectsLoading
                      ? "Loading..."
                      : selectedOrgId
                      ? "Select project"
                      : "Org first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {orgProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
                {orgProjects.length === 0 && (
                  <SelectItem value="none" disabled>
                    No projects available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Org Intelligence Badge */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    hasOrgIntel
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : needsOrgSelection
                      ? "bg-muted text-muted-foreground border-border"
                      : "bg-amber-50 text-amber-600 border-amber-200"
                  )}
                >
                  {needsOrgSelection ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : orgIntelLoading ? (
                    <Brain className="w-3 h-3 animate-pulse" />
                  ) : hasOrgIntel ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  <span className="hidden xl:inline">
                    {needsOrgSelection
                      ? "Select Org"
                      : orgIntelLoading
                      ? "Loading..."
                      : hasOrgIntel
                      ? "OI Active"
                      : "No OI"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {needsOrgSelection ? (
                  <p className="text-xs">
                    Select an organization to activate organization-specific intelligence.
                  </p>
                ) : hasOrgIntel ? (
                  <div className="space-y-1">
                    <p className="font-medium text-xs">Organization Intelligence is enhancing all generations</p>
                    <p className="text-xs whitespace-pre-line text-muted-foreground">{orgSummary}</p>
                  </div>
                ) : (
                  <p className="text-xs">
                    No organization intelligence profile found. Go to AI Studio &gt; Organization Intelligence to analyze.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* History Button */}
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2.5">
                <History className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px]">
              <ProjectHistoryPanel
                organizationId={selectedOrgId || undefined}
                clientProjectId={selectedProjectId || undefined}
                organizationName={orgProfile?.identity?.legalName?.value}
                projectName={selectedProject?.name}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* No Org Warning */}
      {!hasScope && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200 px-4 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Select an organization above to unlock Creative Studio content creation.
        </div>
      )}

      {/* Main Content: Sidebar + Module */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <div
          className={cn(
            "border-r bg-muted/30 flex flex-col transition-all duration-200",
            sidebarCollapsed ? "w-14" : "w-52"
          )}
        >
          <ScrollArea className="flex-1 py-2">
            <div className="px-2 space-y-0.5">
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                const isActive = activeModule === mod.id;
                return (
                  <TooltipProvider key={mod.id} delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveModule(mod.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
                            "hover:bg-accent/60",
                            isActive
                              ? cn(mod.activeClass, "border shadow-sm")
                              : "text-muted-foreground border border-transparent"
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-center justify-center w-7 h-7 rounded-md shrink-0 transition-colors",
                              isActive ? mod.bgClass : "bg-transparent"
                            )}
                          >
                            <Icon className={cn("w-4 h-4", isActive ? mod.textClass : "")} />
                          </div>
                          {!sidebarCollapsed && (
                            <>
                              <span className="truncate flex-1 text-left">{mod.label}</span>
                              {isActive && (
                                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              )}
                            </>
                          )}
                        </button>
                      </TooltipTrigger>
                      {sidebarCollapsed && (
                        <TooltipContent side="right" sideOffset={8}>
                          <p className="font-medium">{mod.label}</p>
                          <p className="text-xs text-muted-foreground">{mod.description}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </ScrollArea>

          {/* Sidebar Collapse Toggle */}
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 px-2"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Module Content Area */}
        <div className="flex-1 overflow-hidden">
          {activeModule === "image" && (
            <ImageGenerationTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          )}
          {activeModule === "landing-page" && (
            <LandingPageTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
              campaignId={campaignIdFromUrl || undefined}
            />
          )}
          {activeModule === "email" && (
            <EmailTemplateTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          )}
          {activeModule === "blog" && (
            <BlogPostTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          )}
          {activeModule === "ebook" && (
            <EbookTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          )}
          {activeModule === "solution-brief" && (
            <SolutionBriefTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          )}
          {activeModule === "chat" && (
            <ChatTab
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
