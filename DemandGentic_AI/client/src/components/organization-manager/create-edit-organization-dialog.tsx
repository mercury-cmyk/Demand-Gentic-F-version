import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';
import type { Organization } from './types';

interface CreateEditOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization | null;
}

export function CreateEditOrganizationDialog({
  open,
  onOpenChange,
  organization,
}: CreateEditOrganizationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!organization;
  const isSuper = organization?.organizationType === 'super';

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [isClient, setIsClient] = useState(true);
  const [isCampaign, setIsCampaign] = useState(false);

  useEffect(() => {
    if (organization) {
      setName(organization.name || '');
      setDomain(organization.domain || '');
      setDescription(organization.description || '');
      setIndustry(organization.industry || '');
      setIsClient(organization.organizationType === 'client' || organization.organizationType === 'super');
      setIsCampaign(organization.isCampaignOrg || organization.organizationType === 'campaign');
    } else {
      setName('');
      setDomain('');
      setDescription('');
      setIndustry('');
      setIsClient(true);
      setIsCampaign(false);
    }
  }, [organization, open]);

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      domain?: string;
      description?: string;
      industry?: string;
      isClient: boolean;
      isCampaign: boolean;
    }) => {
      // Determine which endpoint to use based on type flags
      const isCampaignOnly = data.isCampaign && !data.isClient;
      const endpoint = isCampaignOnly
        ? '/api/organizations/campaign'
        : '/api/organizations/client';
      const res = await apiRequest('POST', endpoint, {
        name: data.name,
        domain: data.domain || undefined,
        description: data.description || undefined,
        industry: data.industry || undefined,
        isCampaignOrg: data.isCampaign,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations/stats'] });
      toast({ title: 'Organization created', description: `${name} has been created successfully.` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      domain?: string;
      description?: string;
      industry?: string;
      isCampaignOrg: boolean;
    }) => {
      const res = await apiRequest('PUT', `/api/organizations/${data.id}`, {
        name: data.name,
        domain: data.domain || undefined,
        description: data.description || undefined,
        industry: data.industry || undefined,
        isCampaignOrg: data.isCampaignOrg,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations/stats'] });
      toast({ title: 'Organization updated', description: `${name} has been updated successfully.` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Organization name is required.' });
      return;
    }
    if (!isClient && !isCampaign && !isSuper) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Select at least one organization type.' });
      return;
    }

    if (isEditing && organization) {
      updateMutation.mutate({
        id: organization.id,
        name: name.trim(),
        domain: domain.trim(),
        description: description.trim(),
        industry: industry.trim(),
        isCampaignOrg: isCampaign,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        domain: domain.trim(),
        description: description.trim(),
        industry: industry.trim(),
        isClient,
        isCampaign,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    
      
        
          
            {isEditing ? `Edit ${organization?.name}` : 'Create Organization'}
          
          
            {isEditing
              ? 'Update the organization details below.'
              : 'Add a new organization. It can serve as client, campaign, or both.'}
          
        

        
          {/* Type checkboxes - not shown for super org */}
          {!isSuper && (
            
              Organization Type
              
                
                   setIsClient(!!checked)}
                  />
                  
                    Client Organization
                  
                
                
                   setIsCampaign(!!checked)}
                  />
                  
                    Campaign Organization
                  
                
              
              
                An organization can be both a client and campaign org simultaneously.
              
            
          )}

          
            Name *
             setName(e.target.value)}
              placeholder="Organization name"
              required
            />
          

          
            Domain
             setDomain(e.target.value)}
              placeholder="example.com"
            />
          

          
            Industry
             setIndustry(e.target.value)}
              placeholder="e.g. Technology, Healthcare"
            />
          

          
            Description
             setDescription(e.target.value)}
              placeholder="Brief description of the organization"
              rows={3}
            />
          

          
             onOpenChange(false)}>
              Cancel
            
            
              {isPending && }
              {isEditing ? 'Update' : 'Create'}
            
          
        
      
    
  );
}