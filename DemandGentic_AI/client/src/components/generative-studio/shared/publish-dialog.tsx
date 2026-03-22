import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Globe, Loader2, ShieldCheck, BookOpen, Package } from "lucide-react";

const CONTENT_TYPE_LABELS: Record = {
  landing_page: "Landing Page",
  blog_post: "Blog Post",
  ebook: "eBook",
  solution_brief: "Solution Brief",
  email_template: "Email Template",
};

const RESOURCE_CATEGORIES = [
  "Whitepapers & eBooks",
  "Solution Briefs",
  "Case Studies",
  "Blog Posts",
  "Webinar Recordings",
  "Product Guides",
  "Industry Reports",
];

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: (data: {
    slug?: string;
    metaTitle?: string;
    metaDescription?: string;
    publishToResourceCenter?: boolean;
    resourceCategory?: string;
    featureIds?: string[];
  }) => void;
  isPublishing: boolean;
  title: string;
  contentType: string;
  organizationId?: string;
}

export default function PublishDialog({
  open,
  onOpenChange,
  onPublish,
  isPublishing,
  title,
  contentType,
  organizationId,
}: PublishDialogProps) {
  const defaultSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const [slug, setSlug] = useState(defaultSlug);
  const [metaTitle, setMetaTitle] = useState(title);
  const [metaDescription, setMetaDescription] = useState("");
  const [publishToResourceCenter, setPublishToResourceCenter] = useState(false);
  const [resourceCategory, setResourceCategory] = useState("");
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);

  // Reset form when dialog opens with new title
  useEffect(() => {
    if (open) {
      setSlug(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
      setMetaTitle(title);
      setMetaDescription("");
      setPublishToResourceCenter(false);
      setResourceCategory("");
      setSelectedFeatureIds([]);
    }
  }, [open, title]);

  // Fetch active features for feature mapping
  const { data: featuresData } = useQuery({
    queryKey: ["content-governance", "features", organizationId, "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/features?organizationId=${organizationId}&status=active`);
      return res.json();
    },
    enabled: !!organizationId && open,
  });

  const features = featuresData?.features || [];
  const typeLabel = CONTENT_TYPE_LABELS[contentType] || contentType;

  function toggleFeature(featureId: string) {
    setSelectedFeatureIds(prev =>
      prev.includes(featureId) ? prev.filter(id => id !== featureId) : [...prev, featureId]
    );
  }

  return (
    
      
        
          Publish {typeLabel}
          
            Make your content available at a public URL. Optionally publish to the Resource Center and map product features.
          
        

        
          {/* URL Slug */}
          
            URL Slug
            
              
              /api/generative-studio/public/
               setSlug(e.target.value)}
                className="flex-1"
                placeholder="url-slug"
              />
            
          

          {/* Meta Title */}
          
            Meta Title
             setMetaTitle(e.target.value)}
              placeholder="SEO title"
            />
            {metaTitle.length}/60 characters
          

          {/* Meta Description */}
          
            Meta Description
             setMetaDescription(e.target.value)}
              placeholder="Brief description for search engines..."
              rows={2}
            />
            {metaDescription.length}/160 characters
          

          {/* Resource Center Publishing */}
          
            
              
                
                
                  Publish to Resource Center
                
              
              
            
            {publishToResourceCenter && (
              
                Resource Category
                
                  
                    
                  
                  
                    {RESOURCE_CATEGORIES.map(cat => (
                      {cat}
                    ))}
                  
                
              
            )}
          

          {/* Feature Mapping (Content Governance) */}
          {features.length > 0 && (
            
              
                
                Map Product Features
              
              
                Link this content to product features for governance tracking.
              
              
                {features.map((feature: any) => (
                  
                     toggleFeature(feature.id)}
                    />
                    {feature.name}
                    {feature.category && (
                      {feature.category}
                    )}
                  
                ))}
              
              {selectedFeatureIds.length > 0 && (
                
                  {selectedFeatureIds.length} feature{selectedFeatureIds.length > 1 ? "s" : ""} will be mapped on publish
                
              )}
            
          )}
        

        
           onOpenChange(false)}>
            Cancel
          
           onPublish({
              slug,
              metaTitle,
              metaDescription,
              publishToResourceCenter,
              resourceCategory: publishToResourceCenter ? resourceCategory : undefined,
              featureIds: selectedFeatureIds.length > 0 ? selectedFeatureIds : undefined,
            })}
            disabled={isPublishing || !slug}
          >
            {isPublishing ? (
              <>
                
                Publishing...
              
            ) : (
              <>
                
                Publish
              
            )}
          
        
      
    
  );
}