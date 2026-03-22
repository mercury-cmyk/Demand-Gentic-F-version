import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import ExportDialog from "./shared/export-dialog";
import PublishDialog from "./shared/publish-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface EbookTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function EbookTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: EbookTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [chapterCount, setChapterCount] = useState("5");
  const [fullHtml, setFullHtml] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/ebook", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });

      // Build preview HTML
      const chapters = data.content?.chapters || [];
      const html = `
        
          ${data.content?.title || ''}
          ${data.content?.subtitle ? `${data.content.subtitle}` : ''}

          
            Executive Summary
            ${data.content?.executiveSummary || ''}
          

          
            Table of Contents
            ${chapters.map((ch: any, i: number) => `Chapter ${i + 1}: ${ch.title}`).join('')}
          

          ${chapters.map((ch: any, i: number) => `
            
              Chapter ${i + 1}: ${ch.title}
              ${ch.contentHtml || ch.content || ''}
              ${ch.keyTakeaways?.length ? `
                
                  Key Takeaways
                  ${ch.keyTakeaways.map((t: string) => `${t}`).join('')}
                
              ` : ''}
            
          `).join('')}

          
            Conclusion
            ${data.content?.conclusion || ''}
          
        
      `;
      setFullHtml(html);
      toast({ title: "eBook generated!" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
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
      toast({ title: "eBook published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = (params: Record) => {
    generateMutation.mutate({
      ...params,
      chapterCount: parseInt(chapterCount),
      organizationId,
      clientProjectId,
    });
  };

  return (
    
      {/* Left panel - Form */}
      
        
          
            
          
          
            eBook
            Multi-chapter eBooks
          
        

        
              Number of Chapters
              
                
                  
                
                
                  3 Chapters
                  5 Chapters
                  7 Chapters
                  10 Chapters
                  12 Chapters
                  15 Chapters
                
              
            
          }
        />
      

      {/* Right panel - Preview */}
      
         setPublishOpen(true) : undefined}
          onExport={() => setExportOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      

       publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "eBook"}
        contentType="ebook"
        organizationId={organizationId}
      />

      
    
  );
}