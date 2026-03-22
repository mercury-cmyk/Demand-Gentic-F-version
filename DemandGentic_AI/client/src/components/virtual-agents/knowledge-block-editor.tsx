/**
 * Knowledge Block Editor Component
 *
 * Modal for viewing and editing individual knowledge blocks.
 * Supports creating agent-specific overrides without modifying the base block.
 *
 * Features:
 * - View/edit block content
 * - Create agent-specific overrides
 * - View version history
 * - Restore previous versions
 * - Token count estimation
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Save,
  RotateCcw,
  History,
  AlertTriangle,
  FileText,
  Clock,
  User,
} from "lucide-react";
import { format } from "date-fns";

interface AssembledBlock {
  id: number;
  name: string;
  slug: string;
  layer: string;
  category: string;
  content: string;
  tokenEstimate: number;
  version: number;
  source: string;
  isOverridden: boolean;
}

interface BlockVersion {
  id: number;
  blockId: number;
  version: number;
  content: string;
  tokenEstimate: number;
  changeReason: string | null;
  changedBy: string | null;
  createdAt: string;
}

interface KnowledgeBlockEditorProps {
  block: AssembledBlock;
  agentId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// Simple token estimation (4 chars per token average)
function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).length;
  const chars = text.length;
  return Math.ceil(words * 0.75 + chars / 16);
}

export function KnowledgeBlockEditor({
  block,
  agentId,
  isOpen,
  onClose,
  onSaved,
}: KnowledgeBlockEditorProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("edit");
  const [content, setContent] = useState(block.content);
  const [changeReason, setChangeReason] = useState("");
  const [createOverride, setCreateOverride] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Reset state when block changes
  useEffect(() => {
    setContent(block.content);
    setChangeReason("");
    setCreateOverride(false);
    setIsDirty(false);
  }, [block]);

  // Calculate current token estimate
  const currentTokens = estimateTokens(content);
  const tokenDelta = currentTokens - block.tokenEstimate;

  // Fetch version history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: [`/api/knowledge-blocks/${block.id}/history`],
    enabled: isOpen && block.id > 0 && activeTab === "history",
  });

  // Update block mutation
  const updateBlockMutation = useMutation({
    mutationFn: async () => {
      const url = createOverride && agentId
        ? `/api/knowledge-blocks/agents/${agentId}/config/${block.id}`
        : `/api/knowledge-blocks/${block.id}`;

      const body = createOverride && agentId
        ? { overrideContent: content }
        : { content, changeReason: changeReason || "Content updated" };

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Saved",
        description: createOverride
          ? "Agent override created successfully"
          : "Knowledge block updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge"] });
      onSaved();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    },
  });

  // Restore version mutation
  const restoreVersionMutation = useMutation({
    mutationFn: async (version: number) => {
      const response = await fetch(`/api/knowledge-blocks/${block.id}/restore/${version}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Restored",
        description: "Block restored to previous version",
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-block-history"] });
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge"] });
      onSaved();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore version",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateBlockMutation.mutate();
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setIsDirty(newContent !== block.content);
  };

  // Is this a virtual/system block that can't be edited directly?
  const isVirtualBlock = block.id  !open && onClose()}>
      
        
          
            
            {block.name}
          
          
            {block.category}
            {block.layer.replace("layer_", "Layer ").replace("_", " ")}
            v{block.version}
            {block.isOverridden && (
              
                Overridden
              
            )}
          
        

         setActiveTab(v as "edit" | "history")} className="flex-1 flex flex-col min-h-0">
          
            Edit Content
            
              
              History
            
          

          
            
              {/* Warning for system blocks */}
              {isSystemBlock && !createOverride && (
                
                  
                  
                    System Block
                    
                      Changes to this block will affect all agents. Consider creating an
                      agent-specific override instead.
                    
                  
                
              )}

              {/* Agent override option */}
              {agentId && !isVirtualBlock && (
                
                  
                    Create agent-specific override
                    
                      Override this block for this agent only, without modifying the base content.
                    
                  
                  
                
              )}

              {/* Content editor */}
              
                
                  Content
                  
                    {currentTokens.toLocaleString()} tokens
                    {tokenDelta !== 0 && (
                       0 ? "text-orange-500" : "text-green-500"}>
                        ({tokenDelta > 0 ? "+" : ""}{tokenDelta})
                      
                    )}
                  
                
                 handleContentChange(e.target.value)}
                  className="font-mono text-sm h-[300px] resize-none"
                  placeholder="Enter knowledge block content..."
                  disabled={isVirtualBlock}
                />
              

              {/* Change reason */}
              {!createOverride && !isVirtualBlock && (
                
                  Change Reason
                   setChangeReason(e.target.value)}
                    placeholder="Brief description of changes (optional)"
                  />
                
              )}
            
          

          
            
              {historyLoading ? (
                
                  
                  
                  
                
              ) : historyData?.history && historyData.history.length > 0 ? (
                
                  {historyData.history.map((version) => (
                    
                      
                        
                          
                            v{version.version}
                          
                          {version.version === block.version && (
                            (current)
                          )}
                        
                        {version.version !== block.version && (
                           restoreVersionMutation.mutate(version.version)}
                            disabled={restoreVersionMutation.isPending}
                          >
                            
                            Restore
                          
                        )}
                      
                      
                        
                          
                          {format(new Date(version.createdAt), "MMM d, yyyy h:mm a")}
                        
                        {version.changedBy && (
                          
                            
                            {version.changedBy}
                          
                        )}
                        {version.tokenEstimate} tokens
                      
                      {version.changeReason && (
                        
                          {version.changeReason}
                        
                      )}
                    
                  ))}
                
              ) : (
                
                  No version history available
                
              )}
            
          
        

        
          
            Cancel
          
          
            {updateBlockMutation.isPending ? (
              <>Saving...
            ) : (
              <>
                
                {createOverride ? "Create Override" : "Save Changes"}
              
            )}
          
        
      
    
  );
}