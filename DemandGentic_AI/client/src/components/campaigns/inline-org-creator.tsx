/**
 * Inline Organization Creator Component
 * 
 * Allows users to create a new organization directly from
 * campaign create/edit pages without leaving the form.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Building2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface InlineOrgCreatorProps {
  onOrgCreated: (orgId: string, orgName: string) => void;
  triggerVariant?: "button" | "link" | "icon";
  triggerSize?: "sm" | "default" | "lg";
}

export function InlineOrgCreator({ 
  onOrgCreated, 
  triggerVariant = "button",
  triggerSize = "sm" 
}: InlineOrgCreatorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    description: "",
    industry: "",
    isDefault: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/organizations", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/dropdown"] });
      
      // Notify parent with the new org
      if (data.organization) {
        onOrgCreated(data.organization.id, data.organization.name);
      }
      
      setIsOpen(false);
      resetForm();
      
      toast({
        title: "Organization created",
        description: `"${formData.name}" has been created and selected`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create organization",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      domain: "",
      description: "",
      industry: "",
      isDefault: false,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter an organization name",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const renderTrigger = () => {
    switch (triggerVariant) {
      case "link":
        return (
          
            
            Add new organization
          
        );
      case "icon":
        return (
          
            
          
        );
      default:
        return (
          
            
            New Organization
          
        );
    }
  };

  return (
     {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      
        {renderTrigger()}
      
      
        
          
            
              
              Create Organization
            
            
              Add a new organization for this campaign. The organization will be available
              for all future campaigns as well.
            
          
          
          
            
              Organization Name *
               setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Acme Corporation"
                autoFocus
              />
            
            
            
              Website Domain
               setFormData({ ...formData, domain: e.target.value })}
                placeholder="e.g., acme.com"
              />
              
                Used for automatic enrichment and research
              
            
            
            
              Industry
               setFormData({ ...formData, industry: e.target.value })}
                placeholder="e.g., Technology - SaaS"
              />
            
            
            
              Description
               setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the organization and what they offer..."
                rows={3}
              />
            
            
            
              
                Set as Default
                
                  Use this organization by default for new campaigns
                
              
               setFormData({ ...formData, isDefault: checked })}
              />
            
          
          
          
             setIsOpen(false)}
            >
              Cancel
            
            
              {createMutation.isPending ? (
                <>
                  
                  Creating...
                
              ) : (
                <>
                  
                  Create Organization
                
              )}
            
          
        
      
    
  );
}