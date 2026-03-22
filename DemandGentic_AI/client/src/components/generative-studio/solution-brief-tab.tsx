import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Briefcase } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import ExportDialog from "./shared/export-dialog";
import PublishDialog from "./shared/publish-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface SolutionBriefTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function SolutionBriefTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: SolutionBriefTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [problemStatement, setProblemStatement] = useState("");
  const [fullHtml, setFullHtml] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/solution-brief", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });

      // Build preview HTML
      const sections = data.content?.sections || [];
      const metrics = data.content?.keyMetrics || [];
      const html = `
        
          ${data.content?.title || ''}

          
            Executive Summary
            ${data.content?.executiveSummary || ''}
          

          ${metrics.length > 0 ? `
            
              ${metrics.map((m: any) => `
                
                  ${m.value}
                  ${m.label}
                  ${m.description || ''}
                
              `).join('')}
            
          ` : ''}

          ${sections.map((s: any) => `
            
              ${s.heading}
              ${s.contentHtml || s.content || ''}
            
          `).join('')}

          ${data.content?.callToAction ? `
            
              ${data.content.callToAction}
            
          ` : ''}
        
      `;
      setFullHtml(html);
      toast({ title: "Solution brief generated!" });
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
      toast({ title: "Solution brief published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = (params: Record) => {
    generateMutation.mutate({
      ...params,
      problemStatement: problemStatement || undefined,
      organizationId,
      clientProjectId,
    });
  };

  return (
    
      {/* Left panel - Form */}
      
        
          
            
          
          
            Solution Brief
            Professional solution briefs
          
        

        
              Problem Statement
               setProblemStatement(e.target.value)}
                rows={3}
                disabled={!organizationId}
              />
            
          }
        />
      

      {/* Right panel - Preview */}
      
         setPublishOpen(true) : undefined}
          onExport={() => setExportOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      

       publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "Solution Brief"}
        contentType="solution_brief"
        organizationId={organizationId}
      />

      
    
  );
}