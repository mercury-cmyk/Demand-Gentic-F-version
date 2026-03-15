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

const CONTENT_TYPE_LABELS: Record<string, string> = {
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
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish {typeLabel}</DialogTitle>
          <DialogDescription>
            Make your content available at a public URL. Optionally publish to the Resource Center and map product features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL Slug */}
          <div className="space-y-2">
            <Label>URL Slug</Label>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="w-3 h-3" />
              /api/generative-studio/public/
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="flex-1"
                placeholder="url-slug"
              />
            </div>
          </div>

          {/* Meta Title */}
          <div className="space-y-2">
            <Label>Meta Title</Label>
            <Input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="SEO title"
            />
            <p className="text-xs text-muted-foreground">{metaTitle.length}/60 characters</p>
          </div>

          {/* Meta Description */}
          <div className="space-y-2">
            <Label>Meta Description</Label>
            <Textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Brief description for search engines..."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">{metaDescription.length}/160 characters</p>
          </div>

          {/* Resource Center Publishing */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-600" />
                <Label className="font-medium cursor-pointer" htmlFor="resource-center-toggle">
                  Publish to Resource Center
                </Label>
              </div>
              <Switch
                id="resource-center-toggle"
                checked={publishToResourceCenter}
                onCheckedChange={setPublishToResourceCenter}
              />
            </div>
            {publishToResourceCenter && (
              <div className="space-y-2">
                <Label className="text-xs">Resource Category</Label>
                <Select value={resourceCategory} onValueChange={setResourceCategory}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCE_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Feature Mapping (Content Governance) */}
          {features.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-cyan-600" />
                <Label className="font-medium">Map Product Features</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Link this content to product features for governance tracking.
              </p>
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {features.map((feature: any) => (
                  <label
                    key={feature.id}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedFeatureIds.includes(feature.id)}
                      onCheckedChange={() => toggleFeature(feature.id)}
                    />
                    <span className="flex-1 truncate">{feature.name}</span>
                    {feature.category && (
                      <Badge variant="outline" className="text-[10px] h-4 shrink-0">{feature.category}</Badge>
                    )}
                  </label>
                ))}
              </div>
              {selectedFeatureIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedFeatureIds.length} feature{selectedFeatureIds.length > 1 ? "s" : ""} will be mapped on publish
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onPublish({
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
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 mr-2" />
                Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
