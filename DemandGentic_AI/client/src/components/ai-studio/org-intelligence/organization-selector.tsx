import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Building2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Organization {
  id: string;
  name: string;
  domain: string | null;
  description?: string | null;
  industry: string | null;
  logoUrl?: string | null;
  organizationType?: string;
  isDefault: boolean;
  isActive?: boolean;
}

interface OrganizationSelectorProps {
  selectedOrgId: string | null;
  onOrgChange: (orgId: string) => void;
  allowCreation?: boolean;
  disabled?: boolean;
}

export function OrganizationSelector({ selectedOrgId, onOrgChange, allowCreation = true, disabled = false }: OrganizationSelectorProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    description: "",
    industry: "",
    isDefault: false,
  });

  const { data: orgsData, isLoading } = useQuery({
    queryKey: ["/api/organizations/dropdown"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/organizations/dropdown");
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/organizations/campaign", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/dropdown"] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PUT", `/api/organizations/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/dropdown"] });
      setIsDialogOpen(false);
      resetForm();
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
    setEditingOrg(null);
  };

  const handleEditClick = (org: Organization) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      domain: org.domain || "",
      description: org.description || "",
      industry: org.industry || "",
      isDefault: org.isDefault,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingOrg) {
      updateMutation.mutate({ id: editingOrg.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Auto-select: prioritize super org, then isDefault, then first org.
  // Also triggers when the current selectedOrgId doesn't match any org in the list.
  // Skip when disabled (e.g. client portal mode — org is set externally).
  useEffect(() => {
    if (disabled) return;
    if (!orgsData?.organizations || orgsData.organizations.length === 0) return;

    // If current selection is valid (exists in the list), keep it
    if (selectedOrgId && orgsData.organizations.some((o) => o.id === selectedOrgId)) return;

    // Otherwise auto-select the best match
    const superOrg = orgsData.organizations.find((o) => o.organizationType === 'super');
    if (superOrg) {
      onOrgChange(superOrg.id);
    } else {
      const defaultOrg = orgsData.organizations.find((o) => o.isDefault);
      if (defaultOrg) {
        onOrgChange(defaultOrg.id);
      } else {
        onOrgChange(orgsData.organizations[0].id);
      }
    }
  }, [orgsData?.organizations, selectedOrgId, onOrgChange, disabled]);

  const organizations = orgsData?.organizations || [];
  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  return (
    
      
        
        Organization:
      

      
        
          
            {selectedOrg && (
              
                {selectedOrg.name}
                {selectedOrg.organizationType === 'super' && (
                  
                    Platform
                  
                )}
                {selectedOrg.organizationType === 'client' && (
                  
                    Client
                  
                )}
              
            )}
          
        
        
          {organizations.map((org) => (
            
              
                
                  {org.name}
                  {org.organizationType === 'super' && (
                    
                      Platform
                    
                  )}
                  {org.organizationType === 'client' && (
                    
                      Client
                    
                  )}
                
              
               {
                  e.stopPropagation();
                  handleEditClick(org);
                }}
              >
                
              
            
          ))}
        
      

      {allowCreation && (
      
        
           resetForm()}>
            
            New Organization
          
        
        
          
            {editingOrg ? "Edit Organization" : "Create Organization"}
            
              {editingOrg
                ? "Update the organization details."
                : "Add a new organization to manage services and problem intelligence."}
            
          
          
            
              Organization Name *
               setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corp"
              />
            
            
              Domain
               setFormData({ ...formData, domain: e.target.value })}
                placeholder="acme.com"
              />
            
            
              Industry
               setFormData({ ...formData, industry: e.target.value })}
                placeholder="Technology - SaaS"
              />
            
            
              Description
               setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the organization..."
                rows={3}
              />
            
            
              
                Set as Default
                
                  Used by default when creating new campaigns
                
              
               setFormData({ ...formData, isDefault: checked })}
              />
            
          
          
             setIsDialogOpen(false)}>
              Cancel
            
            
              {(createMutation.isPending || updateMutation.isPending) && (
                
              )}
              {editingOrg ? "Update" : "Create"}
            
          
        
      
      )}
    
  );
}