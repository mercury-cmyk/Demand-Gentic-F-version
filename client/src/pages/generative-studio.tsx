import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Image,
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
}

export default function GenerativeStudioPage() {
  const [activeTab, setActiveTab] = useState("image");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { data: brandKitsData } = useQuery<{ brandKits?: any[] }>({
    queryKey: ["/api/email-builder/brand-kits"],
  });

  const brandKits = brandKitsData?.brandKits || (Array.isArray(brandKitsData) ? brandKitsData : []);

  useEffect(() => {
    const storedOrgId = localStorage.getItem("generativeStudioOrgId");
    if (storedOrgId) {
      setSelectedOrgId(storedOrgId);
    }
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      localStorage.setItem("generativeStudioOrgId", selectedOrgId);
      const storedProjectId = localStorage.getItem(`generativeStudioProjectId:${selectedOrgId}`);
      setSelectedProjectId(storedProjectId || null);
    } else {
      localStorage.removeItem("generativeStudioOrgId");
      setSelectedProjectId(null);
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
    setSelectedProjectId(orgProjects[0]?.id || null);
  }, [selectedOrgId, selectedProjectId, orgProjects]);

  // Fetch Organization Intelligence profile
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

  // Build a summary string for tooltip
  const orgSummary = orgProfile
    ? [
        orgProfile.identity?.legalName?.value && `Company: ${orgProfile.identity.legalName.value}`,
        orgProfile.identity?.industry?.value && `Industry: ${orgProfile.identity.industry.value}`,
        orgProfile.icp?.personas?.value && `Target Personas: ${orgProfile.icp.personas.value}`,
        orgProfile.positioning?.oneLiner?.value && `Positioning: ${orgProfile.positioning.oneLiner.value}`,
      ].filter(Boolean).join("\n")
    : "";

  const selectedProject = useMemo(
    () => orgProjects.find((project) => project.id === selectedProjectId),
    [orgProjects, selectedProjectId]
  );

  const hasScope = !!selectedOrgId;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Generative Studio</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered content creation hub for images, pages, emails, blogs, and more
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Organization Intelligence Status */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={hasOrgIntel ? "default" : "secondary"}
                  className={`gap-1.5 cursor-default ${
                    hasOrgIntel
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                      : "bg-amber-50 text-amber-600 hover:bg-amber-50 border-amber-200"
                  }`}
                >
                  {needsOrgSelection ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      Select Organization
                    </>
                  ) : orgIntelLoading ? (
                    <>
                      <Brain className="w-3.5 h-3.5 animate-pulse" />
                      Loading OI...
                    </>
                  ) : hasOrgIntel ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Org Intelligence Active
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      No Org Intelligence
                    </>
                  )}
                </Badge>
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
                    No organization intelligence profile found. Go to AI Studio &gt; Organization Intelligence to analyze your organization for better content generation.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="w-4 h-4 mr-2" />
                History
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

      {/* Organization/Project Context */}
      <div className="border-b px-6 py-4 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <OrganizationSelector
            selectedOrgId={selectedOrgId}
            onOrgChange={setSelectedOrgId}
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderKanban className="h-4 w-4" />
              Project:
            </div>
            <Select
              value={selectedProjectId || ""}
              onValueChange={(value) => setSelectedProjectId(value || null)}
              disabled={!selectedOrgId || orgProjectsLoading}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue
                  placeholder={
                    orgProjectsLoading
                      ? "Loading projects..."
                      : selectedOrgId
                      ? "Select project"
                      : "Select organization first"
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
        </div>
        {!hasScope && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5" />
            Select an organization to unlock Generative Studio content creation.
          </div>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="border-b px-6">
          <TabsList className="h-11 bg-transparent gap-1">
            <TabsTrigger value="image" className="gap-1.5 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700">
              <Image className="w-4 h-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="landing-page" className="gap-1.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <Globe className="w-4 h-4" /> Landing Pages
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-1.5 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">
              <Mail className="w-4 h-4" /> Email Templates
            </TabsTrigger>
            <TabsTrigger value="blog" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
              <FileText className="w-4 h-4" /> Blog Posts
            </TabsTrigger>
            <TabsTrigger value="ebook" className="gap-1.5 data-[state=active]:bg-rose-50 data-[state=active]:text-rose-700">
              <BookOpen className="w-4 h-4" /> eBooks
            </TabsTrigger>
            <TabsTrigger value="solution-brief" className="gap-1.5 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
              <Briefcase className="w-4 h-4" /> Solution Briefs
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
              <MessageSquare className="w-4 h-4" /> Chat
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="image" className="h-full mt-0 p-0">
            <ImageGenerationTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          </TabsContent>
          <TabsContent value="landing-page" className="h-full mt-0 p-0">
            <LandingPageTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          </TabsContent>
          <TabsContent value="email" className="h-full mt-0 p-0">
            <EmailTemplateTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          </TabsContent>
          <TabsContent value="blog" className="h-full mt-0 p-0">
            <BlogPostTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          </TabsContent>
          <TabsContent value="ebook" className="h-full mt-0 p-0">
            <EbookTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          </TabsContent>
          <TabsContent value="solution-brief" className="h-full mt-0 p-0">
            <SolutionBriefTab
              brandKits={brandKits}
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
              clientProjectId={selectedProjectId || undefined}
            />
          </TabsContent>
          <TabsContent value="chat" className="h-full mt-0 p-0">
            <ChatTab
              orgIntelligence={orgProfile}
              organizationId={selectedOrgId || undefined}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
