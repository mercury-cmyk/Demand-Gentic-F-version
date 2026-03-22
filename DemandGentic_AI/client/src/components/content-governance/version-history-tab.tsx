import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, History, RotateCcw, Eye, Paintbrush, RefreshCw, ArrowUpDown } from "lucide-react";

interface VersionHistoryTabProps {
  organizationId: string;
}

interface PageVersion {
  id: string;
  publishedPageId: string;
  versionNumber: number;
  htmlContent: string;
  cssContent: string | null;
  changeDescription: string | null;
  changeTrigger: string;
  designPrompt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const TRIGGER_BADGES: Record = {
  manual: { color: "bg-gray-100 text-gray-700", icon: ArrowUpDown, label: "Manual" },
  ai_refresh: { color: "bg-blue-100 text-blue-700", icon: RefreshCw, label: "AI Refresh" },
  design_update: { color: "bg-purple-100 text-purple-700", icon: Paintbrush, label: "Design Update" },
  rollback: { color: "bg-yellow-100 text-yellow-700", icon: RotateCcw, label: "Rollback" },
};

export default function VersionHistoryTab({ organizationId }: VersionHistoryTabProps) {
  const queryClient = useQueryClient();
  const [selectedPageId, setSelectedPageId] = useState("");
  const [previewVersion, setPreviewVersion] = useState(null);
  const [rollbackConfirm, setRollbackConfirm] = useState(null);

  const { data: healthData } = useQuery({
    queryKey: ["content-governance", "health", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/health/${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ["content-governance", "versions", selectedPageId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/versions/${selectedPageId}`);
      return res.json();
    },
    enabled: !!selectedPageId,
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ pageId, versionId }: { pageId: string; versionId: string }) => {
      const res = await apiRequest("POST", `/api/content-governance/versions/${pageId}/rollback/${versionId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-governance", "versions"] });
      queryClient.invalidateQueries({ queryKey: ["content-governance", "health"] });
      setRollbackConfirm(null);
    },
  });

  const pages = healthData?.pages || [];
  const versions: PageVersion[] = versionsData?.versions || [];

  return (
    
      {/* Page Selector */}
      
        
          
            
          
          
            {pages.map((page: any) => (
              
                {page.title}
              
            ))}
          
        
        {selectedPageId && (
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        )}
      

      {!selectedPageId ? (
        
          
            
            Select a page to view its version history.
          
        
      ) : versionsLoading ? (
        
           Loading versions...
        
      ) : versions.length === 0 ? (
        
          
            
            No version history for this page yet.
            Versions are created automatically when pages are republished, refreshed, or have design updates applied.
          
        
      ) : (
        
          {versions.map((version) => {
            const trigger = TRIGGER_BADGES[version.changeTrigger] || TRIGGER_BADGES.manual;
            const TriggerIcon = trigger.icon;

            return (
              
                
                  
                    
                      
                        Version {version.versionNumber}
                        
                          
                          {trigger.label}
                        
                      
                      {version.changeDescription && (
                        {version.changeDescription}
                      )}
                      {version.designPrompt && (
                        Prompt: "{version.designPrompt}"
                      )}
                      
                        {new Date(version.createdAt).toLocaleDateString()} {new Date(version.createdAt).toLocaleTimeString()}
                        {version.createdBy && ` by ${version.createdBy}`}
                      
                    
                    
                       setPreviewVersion(version)}
                      >
                         Preview
                      
                       setRollbackConfirm(version)}
                      >
                         Rollback
                      
                    
                  
                
              
            );
          })}
        
      )}

      {/* Preview Dialog */}
       setPreviewVersion(null)}>
        
          
            Version {previewVersion?.versionNumber} Preview
            {previewVersion?.changeDescription}
          
          
            
          
        
      

      {/* Rollback Confirm Dialog */}
       setRollbackConfirm(null)}>
        
          
            Confirm Rollback
            
              This will restore the page to Version {rollbackConfirm?.versionNumber}. The current page content will be saved as a new version before the rollback is applied.
            
          
          
             setRollbackConfirm(null)}>Cancel
             rollbackConfirm && rollbackMutation.mutate({ pageId: rollbackConfirm.publishedPageId, versionId: rollbackConfirm.id })}
              disabled={rollbackMutation.isPending}
            >
              {rollbackMutation.isPending && }
              Rollback to Version {rollbackConfirm?.versionNumber}
            
          
        
      
    
  );
}