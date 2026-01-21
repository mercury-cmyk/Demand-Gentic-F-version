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
          <Button variant="link" size={triggerSize} className="h-auto p-0 text-primary">
            <Plus className="h-3 w-3 mr-1" />
            Add new organization
          </Button>
        );
      case "icon":
        return (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        );
      default:
        return (
          <Button variant="outline" size={triggerSize} className="gap-1">
            <Plus className="h-4 w-4" />
            New Organization
          </Button>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        {renderTrigger()}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Create Organization
            </DialogTitle>
            <DialogDescription>
              Add a new organization for this campaign. The organization will be available
              for all future campaigns as well.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="org-name">Organization Name *</Label>
              <Input
                id="org-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Acme Corporation"
                autoFocus
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="org-domain">Website Domain</Label>
              <Input
                id="org-domain"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                placeholder="e.g., acme.com"
              />
              <p className="text-xs text-muted-foreground">
                Used for automatic enrichment and research
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="org-industry">Industry</Label>
              <Input
                id="org-industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                placeholder="e.g., Technology - SaaS"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="org-description">Description</Label>
              <Textarea
                id="org-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the organization and what they offer..."
                rows={3}
              />
            </div>
            
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="space-y-0.5">
                <Label htmlFor="org-default">Set as Default</Label>
                <p className="text-xs text-muted-foreground">
                  Use this organization by default for new campaigns
                </p>
              </div>
              <Switch
                id="org-default"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
