import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSipTrunkConfigSchema } from "@shared/schema";
import { z } from "zod";
import { Phone, Plus, Trash2, Star, Power, Settings } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SipTrunkConfig = {
  id: string;
  name: string;
  provider: string;
  sipUsername: string;
  sipPassword: string;
  sipDomain?: string;
  connectionId?: string;
  callerIdNumber?: string;
  isDefault: boolean | null;
  isActive: boolean | null;
  createdAt: Date;
};

const formSchema = insertSipTrunkConfigSchema.extend({
  id: z.string().optional(),
  sipDomain: z
    .string()
    .trim()
    .min(1, "SIP domain is required")
    .refine(
      (value) => !value.includes("://") && !value.includes("/") && value.includes("."),
      "Enter a valid SIP domain (FQDN), e.g. sip.telnyx.com"
    ),
});

type FormData = z.infer;

export default function SipTrunkSettingsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Fetch all SIP trunk configs
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['/api/sip-trunks'],
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      provider: "telnyx",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      connectionId: "",
      callerIdNumber: "",
      isActive: true,
      isDefault: false,
    },
  });

  const providerValue = form.watch("provider");
  const sipDomainValue = form.watch("sipDomain");
  const isTelnyx = providerValue?.trim().toLowerCase() === "telnyx";

  useEffect(() => {
    if (!isTelnyx) return;
    if (!sipDomainValue || sipDomainValue === "sip.provider.com") {
      form.setValue("sipDomain", "sip.telnyx.com");
    }
  }, [form, isTelnyx, sipDomainValue]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (editingConfig) {
        return apiRequest('PATCH', `/api/sip-trunks/${editingConfig.id}`, data);
      } else {
        return apiRequest('POST', '/api/sip-trunks', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: editingConfig ? "Configuration updated" : "Configuration created",
        description: `SIP trunk configuration has been ${editingConfig ? 'updated' : 'created'} successfully.`,
      });
      setIsDialogOpen(false);
      setEditingConfig(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save SIP trunk configuration",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/sip-trunks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Configuration deleted",
        description: "SIP trunk configuration has been deleted successfully.",
      });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete SIP trunk configuration",
        variant: "destructive",
      });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/sip-trunks/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Default trunk set",
        description: "This SIP trunk is now the default for all agents.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set default SIP trunk",
        variant: "destructive",
      });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest('PATCH', `/api/sip-trunks/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Status updated",
        description: "SIP trunk status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const importEnvMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/sip-trunks/import-env', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Imported from environment",
        description: "Telnyx credentials were copied into the SIP Trunk list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import Telnyx credentials",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (config: SipTrunkConfig) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      provider: config.provider,
      sipUsername: config.sipUsername,
      sipPassword: config.sipPassword,
      sipDomain: config.sipDomain || "sip.telnyx.com",
      connectionId: config.connectionId || "",
      callerIdNumber: config.callerIdNumber || "",
      isActive: config.isActive ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingConfig(null);
    form.reset({
      name: "",
      provider: "telnyx",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      connectionId: "",
      callerIdNumber: "",
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    
      
        
          
            
            Telephony Settings
          
          
            Manage SIP trunk configurations for WebRTC telephony integration
          
        
        
          
          Add SIP Trunk
        
      

      
        
          SIP Trunk Configurations
          
            Configure SIP trunks for browser-based calling in the Agent Console
          
        
        
          
            
              Import existing Telnyx credentials from environment variables.
            
             importEnvMutation.mutate()}
              disabled={importEnvMutation.isPending}
              data-testid="button-import-telnyx"
            >
              {importEnvMutation.isPending ? "Importing..." : "Import Telnyx from Env"}
            
          
          {isLoading ? (
            
              Loading configurations...
            
          ) : configs.length === 0 ? (
            
              
              No SIP trunk configurations found
              Add your first SIP trunk to enable calling
            
          ) : (
            
              
                
                  Connection Name
                  Provider
                  SIP Username
                  Connection ID
                  Status
                  Default
                  Actions
                
              
              
                {configs.map((config) => (
                  
                    {config.name}
                    {config.provider || "default"}
                    {config.sipUsername}
                    
                      {config.connectionId ? config.connectionId.slice(0, 10) + '...' : '-'}
                    
                    
                      
                        
                            toggleActiveMutation.mutate({ id: config.id, isActive: checked })
                          }
                          data-testid={`switch-active-${config.id}`}
                        />
                        
                          {config.isActive ? "Active" : "Inactive"}
                        
                      
                    
                    
                      {config.isDefault ? (
                        
                          
                          Default
                        
                      ) : (
                         setDefaultMutation.mutate(config.id)}
                          data-testid={`button-set-default-${config.id}`}
                        >
                          
                        
                      )}
                    
                    
                      
                         handleEdit(config)}
                          data-testid={`button-edit-${config.id}`}
                        >
                          
                        
                         setDeleteConfirmId(config.id)}
                          disabled={config.isDefault ?? false}
                          data-testid={`button-delete-${config.id}`}
                        >
                          
                        
                      
                    
                  
                ))}
              
            
          )}
        
      

      {/* Create/Edit Dialog */}
      
        
          
            
              {editingConfig ? "Edit SIP Trunk Configuration" : "Add SIP Trunk Configuration"}
            
            
              Configure SIP credentials for WebRTC calling
            
          

          
            
               (
                  
                    Connection Name
                    
                      
                    
                    
                      A friendly name to identify this SIP trunk configuration
                    
                    
                  
                )}
              />

               (
                  
                    Provider
                    
                      
                    
                    
                      Popular providers include Telnyx, Twilio, Bandwidth, Plivo, Vonage, SignalWire, Flowroute, and Skyetel
                    
                    
                      
                      
                      
                      
                      
                      
                      
                      
                      
                    
                    
                  
                )}
              />

               (
                  
                    SIP Username
                    
                      
                    
                    
                      The SIP username from your provider
                    
                    
                  
                )}
              />

               (
                  
                    SIP Password
                    
                      
                    
                    
                      The SIP password from your provider
                    
                    
                  
                )}
              />

               (
                  
                    SIP Domain
                    
                      
                    
                    
                      {isTelnyx ? "Telnyx uses sip.telnyx.com." : "The SIP domain/proxy from your provider"}
                    
                    
                  
                )}
              />

               (
                  
                    Connection ID (Optional)
                    
                      
                    
                    
                      {isTelnyx
                        ? "Telnyx Credential Connection ID (Voice → Credentials)."
                        : "Provider-specific connection identifier used for WebRTC authentication"}
                    
                    
                  
                )}
              />

               (
                  
                    Caller ID Number
                    
                      
                    
                    
                      The phone number to display as caller ID for outbound calls
                    
                    
                  
                )}
              />

               (
                  
                    
                      Active
                      
                        Enable this SIP trunk for use in the Agent Console
                      
                    
                    
                      
                    
                  
                )}
              />

              
                 {
                    setIsDialogOpen(false);
                    setEditingConfig(null);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                
                
                  {saveMutation.isPending ? "Saving..." : editingConfig ? "Update" : "Create"}
                
              
            
          
        
      

      {/* Delete Confirmation */}
       setDeleteConfirmId(null)}>
        
          
            Delete SIP Trunk Configuration?
            
              This will permanently delete this SIP trunk configuration. This action cannot be undone.
            
          
          
            Cancel
             deleteConfirmId && handleDelete(deleteConfirmId)}
              data-testid="button-confirm-delete"
            >
              Delete
            
          
        
      
    
  );
}