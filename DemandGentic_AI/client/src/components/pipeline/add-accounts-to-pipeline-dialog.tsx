/**
 * Add Accounts to Pipeline Dialog
 *
 * Dialog for adding existing accounts to a pipeline's top-of-funnel.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Search, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  domain?: string;
  industryStandardized?: string;
  employeesSizeRange?: string;
  revenueRange?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  onAdded?: () => void;
}

export function AddAccountsToPipelineDialog({
  open,
  onOpenChange,
  pipelineId,
  onAdded,
}: Props) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState>(new Set());

  // Fetch all accounts
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/accounts");
      return response.json();
    },
    enabled: open,
  });

  // Filter accounts
  const filteredAccounts = accounts.filter((account) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      account.name?.toLowerCase().includes(query) ||
      account.domain?.toLowerCase().includes(query) ||
      account.industryStandardized?.toLowerCase().includes(query)
    );
  });

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Select all visible
  const selectAll = () => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  };

  // Add accounts mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/pipelines/${pipelineId}/accounts`, {
        accountIds: Array.from(selectedIds),
      });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      toast({
        title: "Success",
        description: result.message || `Added ${result.added} accounts to pipeline`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
      setSelectedIds(new Set());
      onOpenChange(false);
      onAdded?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add accounts",
        variant: "destructive",
      });
    },
  });

  return (
    
      
        
          
            
            Add Accounts to Pipeline
          
          
            Select accounts to add to this pipeline's top-of-funnel for outreach and qualification.
          
        

        
          {/* Search */}
          
            
             setSearchQuery(e.target.value)}
              className="pl-9"
            />
          

          {/* Selection info */}
          {selectedIds.size > 0 && (
            
              
                {selectedIds.size} account(s) selected
              
               setSelectedIds(new Set())}>
                Clear selection
              
            
          )}

          {/* Accounts table */}
          
            
              
                
                  
                     0
                      }
                      onCheckedChange={selectAll}
                    />
                  
                  Account
                  Industry
                  Size
                  Revenue
                
              
              
                {isLoading ? (
                  
                    
                      
                    
                  
                ) : filteredAccounts.length === 0 ? (
                  
                    
                      {searchQuery ? "No accounts match your search" : "No accounts available"}
                    
                  
                ) : (
                  filteredAccounts.slice(0, 100).map((account) => (
                     toggleSelect(account.id)}
                    >
                       e.stopPropagation()}>
                         toggleSelect(account.id)}
                        />
                      
                      
                        
                          
                            
                          
                          
                            {account.name}
                            {account.domain && (
                              {account.domain}
                            )}
                          
                        
                      
                      
                        {account.industryStandardized ? (
                          {account.industryStandardized}
                        ) : (
                          —
                        )}
                      
                      
                        
                          {account.employeesSizeRange || "—"}
                        
                      
                      
                        
                          {account.revenueRange || "—"}
                        
                      
                    
                  ))
                )}
              
            
          

          {filteredAccounts.length > 100 && (
            
              Showing first 100 accounts. Use search to find specific accounts.
            
          )}
        

        
           onOpenChange(false)}>
            Cancel
          
           addMutation.mutate()}
            disabled={addMutation.isPending || selectedIds.size === 0}
          >
            {addMutation.isPending ? (
              <>
                
                Adding...
              
            ) : (
              <>
                
                Add {selectedIds.size} Account(s)
              
            )}
          
        
      
    
  );
}