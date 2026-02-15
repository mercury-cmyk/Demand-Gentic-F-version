import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PanelTop,
  Plus,
  Eye,
  Pencil,
  Copy,
  Globe,
  Archive,
  ExternalLink,
  BarChart3,
  Users,
  TrendingUp,
  FileText,
  Download,
  Calendar,
  Target,
  Layout,
} from "lucide-react";
import PageBuilderDialog from "@/components/content-promotion/page-builder-dialog";

interface ContentPromotionPage {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  pageType: 'gated_download' | 'ungated_download' | 'webinar_registration' | 'demo_request' | 'confirmation';
  status: 'draft' | 'published' | 'archived' | 'expired';
  templateTheme: 'executive' | 'modern_gradient' | 'clean_minimal' | 'bold_impact' | 'tech_forward';
  heroConfig: any;
  assetConfig: any;
  brandingConfig: any;
  formConfig: any;
  socialProofConfig: any;
  benefitsConfig: any;
  urgencyConfig: any;
  thankYouConfig: any;
  seoConfig: any;
  linkedLeadFormId: string | null;
  viewCount: number;
  uniqueViewCount: number;
  submissionCount: number;
  conversionRate: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? "s" : ""} ago`;
  return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
}

const STATUS_BADGE_VARIANTS: Record<string, { className: string; label: string }> = {
  draft: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
  published: { className: "bg-green-100 text-green-700 border-green-200", label: "Published" },
  archived: { className: "bg-red-100 text-red-700 border-red-200", label: "Archived" },
  expired: { className: "bg-amber-100 text-amber-700 border-amber-200", label: "Expired" },
};

const PAGE_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  gated_download: { label: "Gated Download", icon: <Download className="h-3 w-3" /> },
  ungated_download: { label: "Ungated Download", icon: <FileText className="h-3 w-3" /> },
  webinar_registration: { label: "Webinar Registration", icon: <Calendar className="h-3 w-3" /> },
  demo_request: { label: "Demo Request", icon: <Target className="h-3 w-3" /> },
  confirmation: { label: "Confirmation", icon: <Layout className="h-3 w-3" /> },
};

const THEME_LABELS: Record<string, string> = {
  executive: "Executive",
  modern_gradient: "Modern Gradient",
  clean_minimal: "Clean Minimal",
  bold_impact: "Bold Impact",
  tech_forward: "Tech Forward",
};

export default function ContentPromotionManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingPage, setEditingPage] = useState<ContentPromotionPage | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [pageToArchive, setPageToArchive] = useState<ContentPromotionPage | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageTypeFilter, setPageTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Fetch pages
  const { data: pages = [], isLoading } = useQuery<ContentPromotionPage[]>({
    queryKey: ["/api/content-promotion/pages"],
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("POST", `/api/content-promotion/pages/${pageId}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
      toast({
        title: "Page published",
        description: "The page is now live and accessible.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to publish the page.",
        variant: "destructive",
      });
    },
  });

  // Unpublish mutation
  const unpublishMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("POST", `/api/content-promotion/pages/${pageId}/unpublish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
      toast({
        title: "Page unpublished",
        description: "The page has been taken offline.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to unpublish the page.",
        variant: "destructive",
      });
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("DELETE", `/api/content-promotion/pages/${pageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
      toast({
        title: "Page archived",
        description: "The page has been archived successfully.",
      });
      setArchiveDialogOpen(false);
      setPageToArchive(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive the page.",
        variant: "destructive",
      });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("POST", `/api/content-promotion/pages/${pageId}/duplicate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
      toast({
        title: "Page duplicated",
        description: "A copy of the page has been created.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate the page.",
        variant: "destructive",
      });
    },
  });

  // Filtered and sorted pages
  const filteredPages = useMemo(() => {
    let result = [...pages];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((page) =>
        page.title.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((page) => page.status === statusFilter);
    }

    // Page type filter
    if (pageTypeFilter !== "all") {
      result = result.filter((page) => page.pageType === pageTypeFilter);
    }

    // Sort
    switch (sortBy) {
      case "newest":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "most_views":
        result.sort((a, b) => b.viewCount - a.viewCount);
        break;
      case "best_conversion":
        result.sort((a, b) => {
          const rateA = parseFloat(a.conversionRate || "0");
          const rateB = parseFloat(b.conversionRate || "0");
          return rateB - rateA;
        });
        break;
    }

    return result;
  }, [pages, searchQuery, statusFilter, pageTypeFilter, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const totalPages = pages.length;
    const publishedPages = pages.filter((p) => p.status === "published");
    const publishedCount = publishedPages.length;
    const totalViews = pages.reduce((sum, p) => sum + (p.viewCount || 0), 0);
    const avgConversion =
      publishedPages.length > 0
        ? publishedPages.reduce((sum, p) => sum + parseFloat(p.conversionRate || "0"), 0) /
          publishedPages.length
        : 0;

    return { totalPages, publishedCount, totalViews, avgConversion };
  }, [pages]);

  const handleCreate = () => {
    setEditingPage(null);
    setShowBuilder(true);
  };

  const handleEdit = (page: ContentPromotionPage) => {
    setEditingPage(page);
    setShowBuilder(true);
  };

  const handlePreview = (slug: string) => {
    window.open(`/promo/${slug}`, "_blank");
  };

  const handleArchive = (page: ContentPromotionPage) => {
    setPageToArchive(page);
    setArchiveDialogOpen(true);
  };

  const handlePublishToggle = (page: ContentPromotionPage) => {
    if (page.status === "published") {
      unpublishMutation.mutate(page.id);
    } else {
      publishMutation.mutate(page.id);
    }
  };

  const handleBuilderSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
    setShowBuilder(false);
    setEditingPage(null);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <PanelTop className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Content Promotion</h1>
        </div>
        <div className="text-muted-foreground">Loading pages...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PanelTop className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Content Promotion</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Create and manage conversion-optimized landing pages for your email campaigns
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Page
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pages</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.totalPages)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Published</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.publishedCount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.totalViews)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgConversion.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pageTypeFilter} onValueChange={setPageTypeFilter}>
          <SelectTrigger className="sm:w-[200px]">
            <SelectValue placeholder="Page Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="gated_download">Gated Download</SelectItem>
            <SelectItem value="ungated_download">Ungated Download</SelectItem>
            <SelectItem value="webinar_registration">Webinar Registration</SelectItem>
            <SelectItem value="demo_request">Demo Request</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="most_views">Most Views</SelectItem>
            <SelectItem value="best_conversion">Best Conversion</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pages Grid or Empty State */}
      {filteredPages.length === 0 && pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PanelTop className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No content promotion pages yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Create your first landing page to capture leads from email campaigns
          </p>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Page
          </Button>
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No pages match your filters</h3>
          <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPages.map((page) => {
            const statusBadge = STATUS_BADGE_VARIANTS[page.status] || STATUS_BADGE_VARIANTS.draft;
            const pageTypeInfo = PAGE_TYPE_CONFIG[page.pageType] || PAGE_TYPE_CONFIG.gated_download;
            const themeName = THEME_LABELS[page.templateTheme] || page.templateTheme;
            const conversionRate = parseFloat(page.conversionRate || "0");

            return (
              <Card key={page.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base truncate">{page.title}</CardTitle>
                        <Badge variant="outline" className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                          {pageTypeInfo.icon}
                          {pageTypeInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {themeName}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-4">
                  {/* Slug */}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="font-mono text-xs truncate">/promo/{page.slug}</span>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      <span>{formatNumber(page.viewCount)} views</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{formatNumber(page.submissionCount)} submissions</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>{conversionRate.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Created date */}
                  <div className="text-xs text-muted-foreground">
                    Created {formatRelativeTime(page.createdAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(page.slug)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(page)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => duplicateMutation.mutate(page.id)}
                      disabled={duplicateMutation.isPending}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Duplicate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePublishToggle(page)}
                      disabled={publishMutation.isPending || unpublishMutation.isPending}
                    >
                      <Globe className="h-3.5 w-3.5 mr-1" />
                      {page.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchive(page)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Archive className="h-3.5 w-3.5 mr-1" />
                      Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Page Builder Dialog */}
      <PageBuilderDialog
        open={showBuilder}
        onOpenChange={setShowBuilder}
        editingPage={editingPage}
        onSuccess={handleBuilderSuccess}
      />

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this page?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive "{pageToArchive?.title}" and make it inaccessible to visitors.
              You can restore it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pageToArchive && archiveMutation.mutate(pageToArchive.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
