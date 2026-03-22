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
import { Plus, Pencil, Trash2, Package, Loader2, Search } from "lucide-react";

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

const STATUS_COLORS: Record = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  deprecated: "bg-yellow-100 text-yellow-700",
  sunset: "bg-red-100 text-red-700",
};

const CATEGORIES = ["Platform", "Integration", "Analytics", "AI & Intelligence", "Communication", "Reporting", "Security", "Other"];

export default function FeatureRegistryTab({ organizationId }: FeatureRegistryTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);

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

  const features: ProductFeature[] = data?.features || [];
  const filtered = features.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || (f.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    
      
        
          
            
             setSearch(e.target.value)}
              className="pl-9"
            />
          
          
            
              
            
            
              All Status
              Draft
              Active
              Deprecated
              Sunset
            
          
        
         { setShowDialog(open); if (!open) { setEditingFeature(null); resetForm(); } }}>
          
             Add Feature
          
          
            
              {editingFeature ? "Edit Feature" : "Add Product Feature"}
              Register a product feature or capability in the governance pipeline.
            
            
              
                Name *
                 setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. AI Call Analytics" />
              
              
                Description
                 setFormData(p => ({ ...p, description: e.target.value }))} placeholder="What this feature does..." rows={2} />
              
              
                
                  Category
                   setFormData(p => ({ ...p, category: v }))}>
                    
                    
                      {CATEGORIES.map(c => {c})}
                    
                  
                
                
                  Status
                   setFormData(p => ({ ...p, status: v }))}>
                    
                    
                      Draft
                      Active
                      Deprecated
                    
                  
                
              
              
                Release Date
                 setFormData(p => ({ ...p, releaseDate: e.target.value }))} />
              
              
                Key Benefits (one per line)
                 setFormData(p => ({ ...p, keyBenefits: e.target.value }))} placeholder="Reduces call handling time by 40%&#10;Improves lead qualification accuracy" rows={3} />
              
              
                Target Personas (comma-separated)
                 setFormData(p => ({ ...p, targetPersonas: e.target.value }))} placeholder="VP Sales, SDR Manager, RevOps" />
              
              
                Competitive Angle
                 setFormData(p => ({ ...p, competitiveAngle: e.target.value }))} placeholder="Only platform with real-time AI coaching" />
              
            
            
               setShowDialog(false)}>Cancel
              
                {(createMutation.isPending || updateMutation.isPending) && }
                {editingFeature ? "Update" : "Create"}
              
            
          
        
      

      {isLoading ? (
        
           Loading features...
        
      ) : filtered.length === 0 ? (
        
          
            
            No product features registered yet.
            Add features to start governing your content.
          
        
      ) : (
        
          
            
              
                Feature
                Category
                Status
                Benefits
                Release
                Actions
              
            
            
              {filtered.map((feature) => (
                
                  
                    
                      {feature.name}
                      {feature.description && {feature.description}}
                    
                  
                  
                    {feature.category ? {feature.category} : -}
                  
                  
                    {feature.status}
                  
                  
                    {(feature.keyBenefits || []).length} benefits
                  
                  
                    {feature.releaseDate ? new Date(feature.releaseDate).toLocaleDateString() : "-"}
                  
                  
                    
                       openEdit(feature)}>
                        
                      
                       deleteMutation.mutate(feature.id)}
                        disabled={deleteMutation.isPending}
                      >
                        
                      
                    
                  
                
              ))}
            
          
        
      )}
    
  );
}