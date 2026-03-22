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

type CreateAssetForm = z.infer;

export default function ContentStudioPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const { toast } = useToast();

  const { data: assets, isLoading } = useQuery({
    queryKey: ['/api/content-assets'],
  });

  const form = useForm({
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
      case "email_template": return ;
      case "landing_page": return ;
      case "social_post": return ;
      case "ad_creative": return ;
      case "video": return ;
      case "pdf_document": return ;
      case "call_script": return ;
      case "sales_sequence": return ;
      case "blog_post": return ;
      default: return ;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record = {
      draft: { variant: "outline", label: "Draft" },
      in_review: { variant: "secondary", label: "In Review" },
      approved: { className: "bg-green-500/10 text-green-500 border-green-500/20", label: "Approved" },
      rejected: { className: "bg-red-500/10 text-red-500 border-red-500/20", label: "Rejected" },
      published: { className: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "Published" },
    };
    const config = variants[status] || variants.draft;
    return {config.label};
  };

  return (
    
      {/* Header */}
      
        
          Content Studio
          
            AI-powered content creation, management, and publishing
          
        
        
           setLocation("/content-studio/calendar")}>
            
            Calendar
          
           setLocation("/content-studio/analytics")}>
            
            Analytics
          
           setLocation("/content-studio/ai-generator")} data-testid="button-ai-generator">
            
            AI Generator
          
           setCreateDialogOpen(true)} data-testid="button-create-asset">
            
            Create Asset
          
        
      

      {/* Search & Filters */}
      
        
          
           setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        
        
          
        
      

      {/* Tabs & Content */}
      
        
          
            All Assets
            Email Templates
            Landing Pages
            Social Posts
            Ad Creatives
            Documents
          

          
            {isLoading ? (
              
                {[...Array(6)].map((_, i) => (
                  
                    
                      
                      
                    
                    
                      
                    
                  
                ))}
              
            ) : filteredAssets && filteredAssets.length > 0 ? (
              
                {filteredAssets.map((asset) => (
                   handleAssetClick(asset)}
                    data-testid={`asset-card-${asset.id}`}
                  >
                    
                      
                        
                          {getAssetIcon(asset.assetType)}
                          {asset.title}
                        
                        {getStatusBadge(asset.approvalStatus)}
                      
                      
                        {asset.description || "No description"}
                      
                    
                    
                      {asset.thumbnailUrl && (
                        
                      )}
                      
                        {asset.tags?.slice(0, 3).map((tag) => (
                          
                            {tag}
                          
                        ))}
                        {asset.tags && asset.tags.length > 3 && (
                          
                            +{asset.tags.length - 3}
                          
                        )}
                      
                      
                        v{asset.version}
                        {new Date(asset.updatedAt).toLocaleDateString()}
                      
                      {asset.linkedCampaigns && asset.linkedCampaigns.length > 0 && (
                        
                          Used in {asset.linkedCampaigns.length} campaign{asset.linkedCampaigns.length > 1 ? 's' : ''}
                        
                      )}
                    
                  
                ))}
              
            ) : (
               setCreateDialogOpen(true)}
                actionLabel="Create Asset"
              />
            )}
          
        
      

      {/* Create Asset Dialog */}
      
        
          
            Create Content Asset
            
              Create a new content asset for your marketing campaigns
            
          
          
             createAssetMutation.mutate(data))} className="space-y-4">
               (
                  
                    Asset Type
                    
                      
                        
                          
                        
                      
                      
                        Email Template
                        Landing Page
                        Social Post
                        Ad Creative
                        PDF Document
                        Video
                        Call Script
                        Sales Sequence
                        Blog Post
                      
                    
                    
                  
                )}
              />

               (
                  
                    Title
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Description
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Tags
                    
                      
                    
                    
                  
                )}
              />

              
                 setCreateDialogOpen(false)}>
                  Cancel
                
                
                  {createAssetMutation.isPending ? "Creating..." : "Create Asset"}
                
              
            
          
        
      

      {/* Push to Resources Center Dialog */}
      
        
          
            
              
              Push to Resources Center
            
            
              Publish this content asset to the public Resources Center
            
          

          {selectedAsset && (
            
              {/* Asset Info */}
              
                
                  {getAssetIcon(selectedAsset.assetType)}
                  {selectedAsset.title}
                
                
                  {selectedAsset.description || "No description"}
                
                {selectedAsset.tags && selectedAsset.tags.length > 0 && (
                  
                    {selectedAsset.tags.map((tag) => (
                      
                        {tag}
                      
                    ))}
                  
                )}
              

              {/* Push Button */}
               pushMutation.mutate(selectedAsset.id)}
                disabled={pushMutation.isPending}
                className="w-full"
                data-testid="button-push-asset"
              >
                {pushMutation.isPending ? (
                  <>
                    
                    Pushing...
                  
                ) : (
                  <>
                    
                    Push to Resources Center
                  
                )}
              

              {/* Push History */}
              {pushHistory && pushHistory.length > 0 && (
                
                  
                    
                    Push History
                  
                  
                    {pushHistory.map((push: any) => (
                      
                        
                          
                            {push.status === 'success' && (
                              
                            )}
                            {push.status === 'failed' && (
                              
                            )}
                            {(push.status === 'pending' || push.status === 'in_progress' || push.status === 'retrying') && (
                              
                            )}
                            
                              {push.status.replace('_', ' ')}
                            
                          
                          
                            {new Date(push.createdAt).toLocaleString()}
                          
                        

                        {push.externalId && (
                          
                            
                            
                              External ID: {push.externalId}
                            
                          
                        )}

                        {push.errorMessage && (
                          
                            {push.errorMessage}
                          
                        )}

                        
                          
                            Attempt {push.attemptCount} of {push.maxAttempts}
                          
                          {push.status === 'failed' && push.attemptCount  retryPushMutation.mutate(push.id)}
                              disabled={retryPushMutation.isPending}
                              data-testid={`button-retry-${push.id}`}
                            >
                              
                              Retry
                            
                          )}
                        
                      
                    ))}
                  
                
              )}
            
          )}

          
             setPushDialogOpen(false)}>
              Close
            
          
        
      
    
  );
}