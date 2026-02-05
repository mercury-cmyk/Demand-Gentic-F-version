import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { 
  Plus, 
  Search, 
  Sparkles, 
  Mail, 
  FileText, 
  Image, 
  Video, 
  FileCode,
  Share2,
  Calendar,
  BarChart3,
  Filter,
  Cloud,
  Upload,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  ExternalLink
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { type ContentAsset } from "@shared/schema";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const createAssetSchema = z.object({
  assetType: z.enum([
    "email_template", 
    "landing_page", 
    "social_post", 
    "ad_creative", 
    "pdf_document", 
    "video", 
    "call_script", 
    "sales_sequence", 
    "blog_post"
  ]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  tags: z.string().optional(), // Will be split into array
});

type CreateAssetForm = z.infer<typeof createAssetSchema>;

export default function ContentStudioPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ContentAsset | null>(null);
  const { toast } = useToast();

  const { data: assets, isLoading } = useQuery<ContentAsset[]>({
    queryKey: ['/api/content-assets'],
  });

  const form = useForm<CreateAssetForm>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      assetType: "email_template",
      title: "",
      description: "",
      tags: "",
    },
  });

  const createAssetMutation = useMutation({
    mutationFn: async (data: CreateAssetForm) => {
      const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      return apiRequest('POST', '/api/content-assets', {
        assetType: data.assetType,
        title: data.title,
        description: data.description || null,
        tags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-assets'] });
      setCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Asset created",
        description: "Your content asset has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create content asset. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: pushHistory } = useQuery({
    queryKey: ['/api/content-assets', selectedAsset?.id, 'pushes'],
    enabled: !!selectedAsset && pushDialogOpen,
  });

  const pushMutation = useMutation({
    mutationFn: async (assetId: string) => {
      return apiRequest('POST', `/api/content-assets/${assetId}/push`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-assets', selectedAsset?.id, 'pushes'] });
      toast({
        title: "Push initiated",
        description: "Content is being pushed to Resources Center.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Push failed",
        description: error.message || "Failed to push content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const retryPushMutation = useMutation({
    mutationFn: async (pushId: string) => {
      return apiRequest('POST', `/api/content-pushes/${pushId}/retry`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-assets', selectedAsset?.id, 'pushes'] });
      toast({
        title: "Retry initiated",
        description: "Retrying push to Resources Center.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Retry failed",
        description: error.message || "Failed to retry push. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAssetClick = (asset: ContentAsset) => {
    setSelectedAsset(asset);
    setPushDialogOpen(true);
  };

  const filteredAssets = assets?.filter(asset => {
    const matchesSearch = asset.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || asset.assetType === activeTab;
    return matchesSearch && matchesTab;
  });

  const getAssetIcon = (type: string) => {
    switch (type) {
      case "email_template": return <Mail className="w-4 h-4" />;
      case "landing_page": return <FileCode className="w-4 h-4" />;
      case "social_post": return <Share2 className="w-4 h-4" />;
      case "ad_creative": return <Image className="w-4 h-4" />;
      case "video": return <Video className="w-4 h-4" />;
      case "pdf_document": return <FileText className="w-4 h-4" />;
      case "call_script": return <FileText className="w-4 h-4" />;
      case "sales_sequence": return <FileText className="w-4 h-4" />;
      case "blog_post": return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: { variant: "outline", label: "Draft" },
      in_review: { variant: "secondary", label: "In Review" },
      approved: { className: "bg-green-500/10 text-green-500 border-green-500/20", label: "Approved" },
      rejected: { className: "bg-red-500/10 text-red-500 border-red-500/20", label: "Rejected" },
      published: { className: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "Published" },
    };
    const config = variants[status] || variants.draft;
    return <Badge {...config}>{config.label}</Badge>;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-3xl font-bold">Content Studio</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered content creation, management, and publishing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation("/content-studio/calendar")}>
            <Calendar className="w-4 h-4 mr-2" />
            Calendar
          </Button>
          <Button variant="outline" onClick={() => setLocation("/content-studio/analytics")}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </Button>
          <Button onClick={() => setLocation("/content-studio/ai-generator")} data-testid="button-ai-generator">
            <Sparkles className="w-4 h-4 mr-2" />
            AI Generator
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-asset">
            <Plus className="w-4 h-4 mr-2" />
            Create Asset
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4 p-6 border-b">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets by title, tags, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs & Content */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="all" data-testid="tab-all">All Assets</TabsTrigger>
            <TabsTrigger value="email_template" data-testid="tab-email">Email Templates</TabsTrigger>
            <TabsTrigger value="landing_page" data-testid="tab-landing">Landing Pages</TabsTrigger>
            <TabsTrigger value="social_post" data-testid="tab-social">Social Posts</TabsTrigger>
            <TabsTrigger value="ad_creative" data-testid="tab-ads">Ad Creatives</TabsTrigger>
            <TabsTrigger value="pdf_document" data-testid="tab-pdfs">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2 mt-2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredAssets && filteredAssets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAssets.map((asset) => (
                  <Card 
                    key={asset.id} 
                    className="hover-elevate cursor-pointer transition-all"
                    onClick={() => handleAssetClick(asset)}
                    data-testid={`asset-card-${asset.id}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getAssetIcon(asset.assetType)}
                          <CardTitle className="text-lg truncate">{asset.title}</CardTitle>
                        </div>
                        {getStatusBadge(asset.approvalStatus)}
                      </div>
                      <CardDescription className="line-clamp-2">
                        {asset.description || "No description"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {asset.thumbnailUrl && (
                        <img 
                          src={asset.thumbnailUrl} 
                          alt={asset.title}
                          className="w-full h-32 object-cover rounded-md mb-3"
                        />
                      )}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {asset.tags?.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {asset.tags && asset.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{asset.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>v{asset.version}</span>
                        <span>{new Date(asset.updatedAt).toLocaleDateString()}</span>
                      </div>
                      {asset.linkedCampaigns && asset.linkedCampaigns.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Used in {asset.linkedCampaigns.length} campaign{asset.linkedCampaigns.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Sparkles}
                title="No assets found"
                description={searchQuery ? "Try adjusting your search" : "Create your first content asset to get started"}
                onAction={() => setCreateDialogOpen(true)}
                actionLabel="Create Asset"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Asset Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Content Asset</DialogTitle>
            <DialogDescription>
              Create a new content asset for your marketing campaigns
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createAssetMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="assetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-asset-type">
                          <SelectValue placeholder="Select asset type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="email_template">Email Template</SelectItem>
                        <SelectItem value="landing_page">Landing Page</SelectItem>
                        <SelectItem value="social_post">Social Post</SelectItem>
                        <SelectItem value="ad_creative">Ad Creative</SelectItem>
                        <SelectItem value="pdf_document">PDF Document</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="call_script">Call Script</SelectItem>
                        <SelectItem value="sales_sequence">Sales Sequence</SelectItem>
                        <SelectItem value="blog_post">Blog Post</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter asset title" data-testid="input-asset-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter asset description" rows={3} data-testid="input-asset-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter tags separated by commas" data-testid="input-asset-tags" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAssetMutation.isPending} data-testid="button-submit-asset">
                  {createAssetMutation.isPending ? "Creating..." : "Create Asset"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Push to Resources Center Dialog */}
      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              Push to Resources Center
            </DialogTitle>
            <DialogDescription>
              Publish this content asset to the public Resources Center
            </DialogDescription>
          </DialogHeader>

          {selectedAsset && (
            <div className="space-y-4">
              {/* Asset Info */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  {getAssetIcon(selectedAsset.assetType)}
                  <h3 className="font-semibold">{selectedAsset.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedAsset.description || "No description"}
                </p>
                {selectedAsset.tags && selectedAsset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedAsset.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Push Button */}
              <Button
                onClick={() => pushMutation.mutate(selectedAsset.id)}
                disabled={pushMutation.isPending}
                className="w-full"
                data-testid="button-push-asset"
              >
                {pushMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Pushing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Push to Resources Center
                  </>
                )}
              </Button>

              {/* Push History */}
              {pushHistory && pushHistory.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Push History
                  </h4>
                  <div className="space-y-2">
                    {pushHistory.map((push: any) => (
                      <div
                        key={push.id}
                        className="p-3 border rounded-lg space-y-2"
                        data-testid={`push-record-${push.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {push.status === 'success' && (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                            {push.status === 'failed' && (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            {(push.status === 'pending' || push.status === 'in_progress' || push.status === 'retrying') && (
                              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                            )}
                            <span className="text-sm font-medium capitalize">
                              {push.status.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(push.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {push.externalId && (
                          <div className="flex items-center gap-2 text-xs">
                            <ExternalLink className="w-3 h-3" />
                            <span className="text-muted-foreground">
                              External ID: {push.externalId}
                            </span>
                          </div>
                        )}

                        {push.errorMessage && (
                          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                            {push.errorMessage}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Attempt {push.attemptCount} of {push.maxAttempts}
                          </span>
                          {push.status === 'failed' && push.attemptCount < push.maxAttempts && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryPushMutation.mutate(push.id)}
                              disabled={retryPushMutation.isPending}
                              data-testid={`button-retry-${push.id}`}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPushDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
