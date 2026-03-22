import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, HeartPulse, RefreshCw, Paintbrush, ExternalLink, AlertCircle } from "lucide-react";

interface PageHealthTabProps {
  organizationId: string;
}

interface PageHealth {
  id: string;
  title: string;
  slug: string;
  healthScore: number;
  daysSinceUpdate: number;
  totalMappings: number;
  staleFeatures: { id: string; name: string }[];
  lastUpdated: string;
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getHealthBg(score: number): string {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 50) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

export default function PageHealthTab({ organizationId }: PageHealthTabProps) {
  const [designDialog, setDesignDialog] = useState(null);
  const [designPrompt, setDesignPrompt] = useState("");
  const [refreshDialog, setRefreshDialog] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewContext, setPreviewContext] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["content-governance", "health", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/health/${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const refreshMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await apiRequest("POST", "/api/content-governance/refresh/generate", {
        publishedPageId: pageId,
        organizationId,
      });
      return res.json();
    },
    onSuccess: (result, pageId) => {
      setPreviewHtml(result.preview.updatedHtml);
      setPreviewContext({
        pageId,
        type: "refresh",
        changeDescription: result.preview.changeDescription,
      });
      setRefreshDialog(null);
    },
  });

  const designMutation = useMutation({
    mutationFn: async ({ pageId, prompt }: { pageId: string; prompt: string }) => {
      const res = await apiRequest("POST", "/api/content-governance/design/improve", {
        publishedPageId: pageId,
        designPrompt: prompt,
        organizationId,
      });
      return res.json();
    },
    onSuccess: (result, { pageId, prompt }) => {
      setPreviewHtml(result.preview.updatedHtml);
      setPreviewContext({
        pageId,
        type: "design",
        changeDescription: result.preview.changeDescription,
        designPrompt: prompt,
      });
      setDesignDialog(null);
      setDesignPrompt("");
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!previewContext || !previewHtml) return;
      const endpoint = previewContext.type === "refresh" ? "/api/content-governance/refresh/apply" : "/api/content-governance/design/apply";
      const res = await apiRequest("POST", endpoint, {
        publishedPageId: previewContext.pageId,
        updatedHtml: previewHtml,
        changeDescription: previewContext.changeDescription,
        designPrompt: previewContext.designPrompt,
      });
      return res.json();
    },
    onSuccess: () => {
      setPreviewHtml(null);
      setPreviewContext(null);
    },
  });

  const pages: PageHealth[] = data?.pages || [];
  const avgScore = data?.averageHealthScore || 0;

  if (isLoading) {
    return (
      
         Calculating page health...
      
    );
  }

  return (
    
      {/* Summary */}
      
        
          
            {avgScore}%
            Average Health Score
          
        
        
          
            {pages.length}
            Published Pages
          
        
        
          
            {pages.filter(p => p.staleFeatures.length > 0).length}
            Pages Needing Refresh
          
        
      

      {/* Preview Panel */}
      {previewHtml && previewContext && (
        
          
            
              {previewContext.type === "refresh" ?  : }
              {previewContext.type === "refresh" ? "Content Refresh Preview" : "Design Improvement Preview"}
            
            {previewContext.changeDescription}
          
          
            
              
            
            
               { setPreviewHtml(null); setPreviewContext(null); }}>Discard
               applyMutation.mutate()} disabled={applyMutation.isPending}>
                {applyMutation.isPending && }
                Apply Changes
              
            
          
        
      )}

      {/* Page Cards */}
      {pages.length === 0 ? (
        
          
            
            No published pages to monitor.
          
        
      ) : (
        
          {pages.map((page) => (
            
              
                
                  
                    {page.title}
                    /{page.slug}
                  
                  {page.healthScore}%
                
              
              
                
                  Updated {page.daysSinceUpdate}d ago
                  {page.totalMappings} features mapped
                
                {page.staleFeatures.length > 0 && (
                  
                    
                    Stale features: {page.staleFeatures.map(f => f.name).join(", ")}
                  
                )}
                
                   setRefreshDialog({ pageId: page.id, pageTitle: page.title })}
                  >
                     Refresh Content
                  
                   setDesignDialog({ pageId: page.id, pageTitle: page.title })}
                  >
                     Improve Design
                  
                
              
            
          ))}
        
      )}

      {/* Refresh Confirm Dialog */}
       setRefreshDialog(null)}>
        
          
            AI Content Refresh
            
              AI will analyze "{refreshDialog?.pageTitle}" and update its content to incorporate the latest product features. You'll see a preview before anything goes live.
            
          
          
             setRefreshDialog(null)}>Cancel
             refreshDialog && refreshMutation.mutate(refreshDialog.pageId)}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending && }
              Generate Refresh
            
          
        
      

      {/* Design Improvement Dialog */}
       { setDesignDialog(null); setDesignPrompt(""); }}>
        
          
            Prompt-Based Design Improvement
            
              Describe how you want to change the visual design of "{designDialog?.pageTitle}". AI will only modify layout, colors, spacing, and styling — content stays the same.
            
          
           setDesignPrompt(e.target.value)}
            placeholder='e.g. "Make it more modern with a gradient hero section, increase whitespace, use larger CTA buttons"'
            rows={3}
          />
          
             { setDesignDialog(null); setDesignPrompt(""); }}>Cancel
             designDialog && designMutation.mutate({ pageId: designDialog.pageId, prompt: designPrompt })}
              disabled={!designPrompt.trim() || designMutation.isPending}
            >
              {designMutation.isPending && }
              Generate Preview
            
          
        
      
    
  );
}