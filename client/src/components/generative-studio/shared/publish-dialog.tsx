import { useState } from "react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Globe, Loader2 } from "lucide-react";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: (data: { slug?: string; metaTitle?: string; metaDescription?: string }) => void;
  isPublishing: boolean;
  title: string;
  contentType: string;
}

export default function PublishDialog({
  open,
  onOpenChange,
  onPublish,
  isPublishing,
  title,
  contentType,
}: PublishDialogProps) {
  const defaultSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const [slug, setSlug] = useState(defaultSlug);
  const [metaTitle, setMetaTitle] = useState(title);
  const [metaDescription, setMetaDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish {contentType === "landing_page" ? "Landing Page" : "Blog Post"}</DialogTitle>
          <DialogDescription>
            This will make your content available at a public URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="space-y-2">
            <Label>Meta Title</Label>
            <Input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="SEO title"
            />
            <p className="text-xs text-muted-foreground">{metaTitle.length}/60 characters</p>
          </div>

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onPublish({ slug, metaTitle, metaDescription })}
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
