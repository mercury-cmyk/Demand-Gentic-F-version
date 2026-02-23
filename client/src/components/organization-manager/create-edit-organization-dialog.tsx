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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit ${organization?.name}` : 'Create Organization'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the organization details below.'
              : 'Add a new organization. It can serve as client, campaign, or both.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type checkboxes - not shown for super org */}
          {!isSuper && (
            <div className="space-y-3">
              <Label>Organization Type</Label>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isClient"
                    checked={isClient}
                    onCheckedChange={(checked) => setIsClient(!!checked)}
                  />
                  <Label htmlFor="isClient" className="font-normal cursor-pointer">
                    Client Organization
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isCampaign"
                    checked={isCampaign}
                    onCheckedChange={(checked) => setIsCampaign(!!checked)}
                  />
                  <Label htmlFor="isCampaign" className="font-normal cursor-pointer">
                    Campaign Organization
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                An organization can be both a client and campaign org simultaneously.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Technology, Healthcare"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the organization"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
