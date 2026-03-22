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
  Trash2,
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
  clientAccountId?: string | null;
  projectId?: string | null;
  campaignId?: string | null;
  organizationId?: string | null;
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
  sourceType?: 'content_promotion' | 'content_studio';
  sourceProjectId?: string | null;
  previewPath?: string | null;
  contextSnapshot?: {
    clientName?: string | null;
    projectName?: string | null;
    campaignName?: string | null;
    organizationName?: string | null;
    campaignObjective?: string | null;
    campaignContextBrief?: string | null;
  } | null;
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

  if (diffSeconds  = {
  draft: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
  published: { className: "bg-green-100 text-green-700 border-green-200", label: "Published" },
  archived: { className: "bg-red-100 text-red-700 border-red-200", label: "Archived" },
  expired: { className: "bg-amber-100 text-amber-700 border-amber-200", label: "Expired" },
};

const PAGE_TYPE_CONFIG: Record = {
  gated_download: { label: "Gated Download", icon:  },
  ungated_download: { label: "Ungated Download", icon:  },
  webinar_registration: { label: "Webinar Registration", icon:  },
  demo_request: { label: "Demo Request", icon:  },
  confirmation: { label: "Confirmation", icon:  },
};

const THEME_LABELS: Record = {
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
  const [editingPage, setEditingPage] = useState(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [pageToArchive, setPageToArchive] = useState(null);

  // Get context from URL or parent
  const searchParams = new URLSearchParams(window.location.search);
  const campaignId = searchParams.get('campaignId') || undefined;
  const projectId = searchParams.get('projectId') || undefined;
  const organizationId = searchParams.get('organizationId') || undefined;
  const clientId = searchParams.get('clientId') || undefined;
  const isScopedView = !!(campaignId || projectId || organizationId || clientId);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageTypeFilter, setPageTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Fetch pages
  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["/api/content-promotion/pages", { campaignId, projectId, organizationId, clientId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set("campaignId", campaignId);
      if (projectId) params.set("projectId", projectId);
      if (organizationId) params.set("organizationId", organizationId);
      if (clientId) params.set("clientId", clientId);
      const query = params.toString();
      const response = await apiRequest("GET", `/api/content-promotion/pages${query ? `?${query}` : ""}`);
      return response.json();
    },
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

  // Delete mutation
  const archiveMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return await apiRequest("DELETE", `/api/content-promotion/pages/${pageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-promotion/pages"] });
      toast({
        title: "Content deleted",
        description: "The content has been deleted successfully.",
      });
      setArchiveDialogOpen(false);
      setPageToArchive(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the content.",
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
    if (page.sourceType === "content_studio") {
      toast({
        title: "Managed in Content Studio",
        description: "This landing page was created in Content Studio. Open Content Studio to edit it.",
      });
      const studioPath = page.sourceProjectId
        ? `/generative-studio?projectId=${encodeURIComponent(page.sourceProjectId)}`
        : "/generative-studio";
      window.open(studioPath, "_blank");
      return;
    }
    setEditingPage(page);
    setShowBuilder(true);
  };

  const handlePreview = (page: ContentPromotionPage) => {
    // Allow preview for all pages, including drafts
    let path: string;
    
    if (page.sourceType === "content_studio") {
      if (page.status === "published" && page.previewPath) {
        // Published Content Studio pages use their public URL
        path = page.previewPath;
      } else if (page.sourceProjectId) {
        // Draft Content Studio pages: open in studio for preview
        path = `/generative-studio?projectId=${encodeURIComponent(page.sourceProjectId)}`;
        window.open(path, "_blank");
        return;
      } else {
        toast({
          title: "Preview unavailable",
          description: "Unable to locate project for preview.",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Content Promotion pages always use /promo/:slug route
      path = `/promo/${page.slug}`;
      if (page.status !== "published") {
        path += "?preview=true";
      }
    }
    
    window.open(path, "_blank");
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
      
        
          
          Content Promotion
        
        Loading pages...
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
            
            Content Promotion
          
          
            {isScopedView
              ? "Create and manage landing pages linked to the selected client, project, campaign, or organization context"
              : "Create and manage conversion-optimized landing pages for your email campaigns"}
          
        
        
          
          Create Page
        
      

      {/* Stats Cards */}
      
        
          
            Total Pages
            
          
          
            {formatNumber(stats.totalPages)}
          
        
        
          
            Published
            
          
          
            {formatNumber(stats.publishedCount)}
          
        
        
          
            Total Views
            
          
          
            {formatNumber(stats.totalViews)}
          
        
        
          
            Avg Conversion Rate
            
          
          
            {stats.avgConversion.toFixed(1)}%
          
        
      

      {/* Filter Bar */}
      
         setSearchQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        
          
            
          
          
            All Statuses
            Draft
            Published
            Archived
          
        
        
          
            
          
          
            All Types
            Gated Download
            Ungated Download
            Webinar Registration
            Demo Request
          
        
        
          
            
          
          
            Newest First
            Most Views
            Best Conversion
          
        
      

      {/* Pages Grid or Empty State */}
      {filteredPages.length === 0 && pages.length === 0 ? (
        
          
          
            {isScopedView ? "No content promotion pages for this context yet" : "No content promotion pages yet"}
          
          
            {isScopedView
              ? "Create a landing page and it will stay linked to this client, project, campaign, and campaign context."
              : "Create your first landing page to capture leads from email campaigns"}
          
          
            
            Create Your First Page
          
        
      ) : filteredPages.length === 0 ? (
        
          
          No pages match your filters
          Try adjusting your search or filter criteria
        
      ) : (
        
          {filteredPages.map((page) => {
            const statusBadge = STATUS_BADGE_VARIANTS[page.status] || STATUS_BADGE_VARIANTS.draft;
            const pageTypeInfo = PAGE_TYPE_CONFIG[page.pageType] || PAGE_TYPE_CONFIG.gated_download;
            const themeName = THEME_LABELS[page.templateTheme] || page.templateTheme;
            const conversionRate = parseFloat(page.conversionRate || "0");
            const isStudioPage = page.sourceType === "content_studio";
            const canPreview = true; // Always allow preview
            let previewLabel: string;
            if (isStudioPage) {
              previewLabel = page.status === "published" 
                ? (page.previewPath || "Published") 
                : "Draft (opens in Studio)";
            } else {
              previewLabel = `/promo/${page.slug}`;
            }

            return (
              
                
                  
                    
                      
                        {page.title}
                        
                          {statusBadge.label}
                        
                      
                      
                        
                          {pageTypeInfo.icon}
                          {pageTypeInfo.label}
                        
                        {isStudioPage && (
                          
                            Content Studio
                          
                        )}
                        
                          {themeName}
                        
                      
                    
                  
                
                
                  {/* Slug */}
                  
                    
                    {previewLabel}
                  

                  {(page.contextSnapshot?.clientName || page.contextSnapshot?.projectName || page.contextSnapshot?.campaignName || page.contextSnapshot?.organizationName) && (
                    
                      {page.contextSnapshot?.clientName && Client: {page.contextSnapshot.clientName}}
                      {page.contextSnapshot?.projectName && Project: {page.contextSnapshot.projectName}}
                      {page.contextSnapshot?.campaignName && Campaign: {page.contextSnapshot.campaignName}}
                      {page.contextSnapshot?.organizationName && Organization: {page.contextSnapshot.organizationName}}
                    
                  )}

                  {/* Stats Row */}
                  
                    
                      
                      {formatNumber(page.viewCount)} views
                    
                    
                      
                      {formatNumber(page.submissionCount)} submissions
                    
                    
                      
                      {conversionRate.toFixed(1)}%
                    
                  

                  {/* Created date */}
                  
                    Created {formatRelativeTime(page.createdAt)}
                  

                  {/* Actions */}
                  
                     handlePreview(page)}
                      disabled={!canPreview}
                    >
                      
                      Preview
                    
                    {isStudioPage ? (
                      <>
                         {
                            const studioPath = page.sourceProjectId
                              ? `/generative-studio?projectId=${encodeURIComponent(page.sourceProjectId)}`
                              : "/generative-studio";
                            window.open(studioPath, '_blank');
                          }}
                        >
                          
                          Manage in Studio
                        
                         handleArchive(page)}
                          className="text-destructive hover:text-destructive"
                        >
                          
                          Delete
                        
                      
                    ) : (
                      <>
                         handleEdit(page)}
                        >
                          
                          Edit
                        
                         duplicateMutation.mutate(page.id)}
                          disabled={duplicateMutation.isPending}
                        >
                          
                          Duplicate
                        
                         handlePublishToggle(page)}
                          disabled={publishMutation.isPending || unpublishMutation.isPending}
                        >
                          
                          {page.status === "published" ? "Unpublish" : "Publish"}
                        
                         handleArchive(page)}
                          className="text-destructive hover:text-destructive"
                        >
                          
                          Delete
                        
                      
                    )}
                  
                
              
            );
          })}
        
      )}

      {/* Page Builder Dialog */}
      

      {/* Delete Confirmation Dialog */}
      
        
          
            Delete this content?
            
              This will permanently delete "{pageToArchive?.title}".
              This action cannot be undone.
            
          
          
            Cancel
             pageToArchive && archiveMutation.mutate(pageToArchive.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            
          
        
      
    
  );
}