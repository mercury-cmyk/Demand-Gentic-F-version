import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, X } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import PublishDialog from "./shared/publish-dialog";
import ExportDialog from "./shared/export-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface BlogPostTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function BlogPostTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: BlogPostTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [targetLength, setTargetLength] = useState("medium");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/blog-post", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });
      toast({ title: "Blog post generated!" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/generative-studio/publish/${projectId}`, {
        ...data,
        organizationId,
        clientProjectId,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setPublishOpen(false);
      toast({ title: "Blog post published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const saveAsAssetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/generative-studio/save-as-asset/${projectId}`, {
        organizationId,
        clientProjectId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to content library!" });
    },
  });

  const handleGenerate = (params: Record) => {
    generateMutation.mutate({
      ...params,
      keywords: keywords.length > 0 ? keywords : undefined,
      targetLength: targetLength || undefined,
      organizationId,
      clientProjectId,
    });
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  return (
    
      {/* Left panel - Form */}
      
        
          
            
          
          
            Blog Post
            SEO-optimized blog posts
          
        

        
              
                Target Length
                
                  
                    
                  
                  
                    Short (800-1,200 words)
                    Medium (1,500-2,500 words)
                    Long (3,000-5,000 words)
                  
                
              
              
                SEO Keywords
                
                   setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    disabled={!organizationId}
                  />
                
                {keywords.length > 0 && (
                  
                    {keywords.map((kw) => (
                      
                        {kw}
                         setKeywords(keywords.filter((k) => k !== kw))}
                        />
                      
                    ))}
                  
                )}
              
            
          }
        />
      

      {/* Right panel - Preview */}
      
         setPublishOpen(true)}
          onExport={() => setExportOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      

       publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "Blog Post"}
        contentType="blog_post"
        organizationId={organizationId}
      />

      
    
  );
}