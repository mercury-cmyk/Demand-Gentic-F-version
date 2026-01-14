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
  description: string | null;
  industry: string | null;
  logoUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
}

interface OrganizationSelectorProps {
  selectedOrgId: string | null;
  onOrgChange: (orgId: string) => void;
}

export function OrganizationSelector({ selectedOrgId, onOrgChange }: OrganizationSelectorProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    description: "",
    industry: "",
    isDefault: false,
  });

  const { data: orgsData, isLoading } = useQuery<{ organizations: Organization[] }>({
    queryKey: ["/api/organizations"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/organizations", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
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

  // Auto-select default org on load
  useEffect(() => {
    if (orgsData?.organizations && !selectedOrgId) {
      const defaultOrg = orgsData.organizations.find((o) => o.isDefault);
      if (defaultOrg) {
        onOrgChange(defaultOrg.id);
      } else if (orgsData.organizations.length > 0) {
        onOrgChange(orgsData.organizations[0].id);
      }
    }
  }, [orgsData?.organizations, selectedOrgId, onOrgChange]);

  const organizations = orgsData?.organizations || [];
  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Organization:</span>
      </div>

      <Select value={selectedOrgId || ""} onValueChange={onOrgChange}>
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder={isLoading ? "Loading..." : "Select organization"}>
            {selectedOrg && (
              <div className="flex items-center gap-2">
                <span>{selectedOrg.name}</span>
                {selectedOrg.isDefault && (
                  <Badge variant="secondary" className="text-[10px] h-4">
                    Default
                  </Badge>
                )}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {organizations.map((org) => (
            <div key={org.id} className="flex items-center">
              <SelectItem value={org.id} className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{org.name}</span>
                  {org.isDefault && (
                    <Badge variant="secondary" className="text-[10px] h-4">
                      Default
                    </Badge>
                  )}
                </div>
              </SelectItem>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(org);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" onClick={() => resetForm()}>
            <Plus className="h-4 w-4 mr-1" />
            New Organization
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingOrg ? "Edit Organization" : "Create Organization"}</DialogTitle>
            <DialogDescription>
              {editingOrg
                ? "Update the organization details."
                : "Add a new organization to manage services and problem intelligence."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Organization Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                placeholder="acme.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                placeholder="Technology - SaaS"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the organization..."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Set as Default</Label>
                <p className="text-xs text-muted-foreground">
                  Used by default when creating new campaigns
                </p>
              </div>
              <Switch
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingOrg ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
