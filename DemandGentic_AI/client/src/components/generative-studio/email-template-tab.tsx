import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface EmailTemplateTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function EmailTemplateTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: EmailTemplateTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [subjectHint, setSubjectHint] = useState("");
  const [emailType, setEmailType] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/email-template", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });
      toast({ title: "Email template generated!" });
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

  const handleGenerate = (params: Record) => {
    generateMutation.mutate({
      ...params,
      subjectHint: subjectHint || undefined,
      emailType: emailType || undefined,
      organizationId,
      clientProjectId,
    });
  };

  return (
    
      {/* Left panel - Form */}
      
        
          
            
          
          
            Email Template
            Professional email templates
          
        

        
              
                Email Type
                
                  
                    
                  
                  
                    Cold Outreach
                    Follow-up
                    Meeting Request
                    Nurture
                    Breakup
                    Newsletter
                    Product Launch
                    Event Invitation
                  
                
              
              
                Subject Line Hint (optional)
                 setSubjectHint(e.target.value)}
                  disabled={!organizationId}
                />
              
            
          }
        />
      

      {/* Right panel - Preview */}
      
         saveAsAssetMutation.mutate() : undefined}
        />
      
    
  );
}