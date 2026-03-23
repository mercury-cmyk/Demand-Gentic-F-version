import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Package, Loader2, Search, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProductFeature {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  status: string;
  releaseDate: string | null;
  keyBenefits: string[];
  targetPersonas: string[];
  competitiveAngle: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FeatureRegistryTabProps {
  organizationId: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  deprecated: "bg-yellow-100 text-yellow-700",
  sunset: "bg-red-100 text-red-700",
};

const CATEGORIES = [
  "Agentic AI",
  "Voice & Realtime",
  "Campaign Intelligence",
  "Pipeline & Engagement",
  "Content & Creative",
  "Data Management",
  "Email & Communication",
  "Analytics & Reporting",
  "Lead Intelligence",
  "Client Portal",
  "Platform Infrastructure",
  "Integration",
  "Security & Governance",
  "Other",
];

export default function FeatureRegistryTab({ organizationId }: FeatureRegistryTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingFeature, setEditingFeature] = useState<ProductFeature | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    status: "draft",
    releaseDate: "",
    keyBenefits: "",
    targetPersonas: "",
    competitiveAngle: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["content-governance", "features", organizationId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/content-governance/features?${params}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/content-governance/features", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-governance", "features"] });
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/content-governance/features/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-governance", "features"] });
      setShowDialog(false);
      setEditingFeature(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/content-governance/features/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-governance", "features"] });
    },
  });

  function resetForm() {
    setFormData({ name: "", description: "", category: "", status: "draft", releaseDate: "", keyBenefits: "", targetPersonas: "", competitiveAngle: "" });
  }

  function openEdit(feature: ProductFeature) {
    setEditingFeature(feature);
    setFormData({
      name: feature.name,
      description: feature.description || "",
      category: feature.category || "",
      status: feature.status,
      releaseDate: feature.releaseDate ? feature.releaseDate.split("T")[0] : "",
      keyBenefits: (feature.keyBenefits || []).join("\n"),
      targetPersonas: (feature.targetPersonas || []).join(", "),
      competitiveAngle: feature.competitiveAngle || "",
    });
    setShowDialog(true);
  }

  function handleSubmit() {
    const payload = {
      organizationId,
      name: formData.name,
      description: formData.description || null,
      category: formData.category || null,
      status: formData.status,
      releaseDate: formData.releaseDate || null,
      keyBenefits: formData.keyBenefits.split("\n").map(s => s.trim()).filter(Boolean),
      targetPersonas: formData.targetPersonas.split(",").map(s => s.trim()).filter(Boolean),
      competitiveAngle: formData.competitiveAngle || null,
    };

    if (editingFeature) {
      updateMutation.mutate({ id: editingFeature.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handleSeedPlatformFeatures() {
    setIsSeeding(true);
    try {
      const res = await apiRequest("POST", "/api/content-governance/seed-platform-features", { organizationId });
      const result = await res.json();
      toast({
        title: "Platform Features Seeded",
        description: `Created ${result.created} new features, ${result.skipped} already existed. Total: ${result.total} platform capabilities registered.`,
      });
      queryClient.invalidateQueries({ queryKey: ["content-governance", "features"] });
    } catch (err: any) {
      toast({ title: "Seed Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSeeding(false);
    }
  }

  const features: ProductFeature[] = data?.features || [];
  const filtered = features.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || (f.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search features..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="deprecated">Deprecated</SelectItem>
              <SelectItem value="sunset">Sunset</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSeedPlatformFeatures}
            disabled={isSeeding}
            className="gap-1.5"
          >
            {isSeeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isSeeding ? "Seeding..." : "Seed Platform Features"}
          </Button>
          <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) { setEditingFeature(null); resetForm(); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Feature</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingFeature ? "Edit Feature" : "Add Product Feature"}</DialogTitle>
              <DialogDescription>Register a product feature or capability in the governance pipeline.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div>
                <Label>Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. AI Call Analytics" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="What this feature does..." rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="deprecated">Deprecated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Release Date</Label>
                <Input type="date" value={formData.releaseDate} onChange={(e) => setFormData(p => ({ ...p, releaseDate: e.target.value }))} />
              </div>
              <div>
                <Label>Key Benefits (one per line)</Label>
                <Textarea value={formData.keyBenefits} onChange={(e) => setFormData(p => ({ ...p, keyBenefits: e.target.value }))} placeholder="Reduces call handling time by 40%&#10;Improves lead qualification accuracy" rows={3} />
              </div>
              <div>
                <Label>Target Personas (comma-separated)</Label>
                <Input value={formData.targetPersonas} onChange={(e) => setFormData(p => ({ ...p, targetPersonas: e.target.value }))} placeholder="VP Sales, SDR Manager, RevOps" />
              </div>
              <div>
                <Label>Competitive Angle</Label>
                <Input value={formData.competitiveAngle} onChange={(e) => setFormData(p => ({ ...p, competitiveAngle: e.target.value }))} placeholder="Only platform with real-time AI coaching" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingFeature ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading features...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No product features registered yet.</p>
            <p className="text-xs mt-1">Add features to start governing your content.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Benefits</TableHead>
                <TableHead>Release</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((feature) => (
                <TableRow key={feature.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{feature.name}</div>
                      {feature.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{feature.description}</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {feature.category ? <Badge variant="outline">{feature.category}</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[feature.status] || ""}>{feature.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{(feature.keyBenefits || []).length} benefits</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{feature.releaseDate ? new Date(feature.releaseDate).toLocaleDateString() : "-"}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(feature)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMutation.mutate(feature.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
