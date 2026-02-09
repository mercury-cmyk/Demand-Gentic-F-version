import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Download,
  Save,
  Eye,
  Code,
  Copy,
  Check,
  Edit3,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContentPreviewProps {
  content?: string;
  contentHtml?: string;
  contentType: string;
  metadata?: Record<string, any>;
  projectId?: string;
  status?: string;
  onPublish?: () => void;
  onExport?: () => void;
  onSaveAsAsset?: () => void;
  onRefine?: (instructions: string) => void;
  isPublishing?: boolean;
}

export default function ContentPreview({
  content,
  contentHtml,
  contentType,
  metadata,
  projectId,
  status,
  onPublish,
  onExport,
  onSaveAsAsset,
  onRefine,
  isPublishing,
}: ContentPreviewProps) {
  const [viewMode, setViewMode] = useState<"preview" | "html">("preview");
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();

  const htmlContent = contentHtml || content || "";

  useEffect(() => {
    if (iframeRef.current && viewMode === "preview" && htmlContent) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
      }
    }
  }, [htmlContent, viewMode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  if (!htmlContent) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Eye className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-lg font-medium">No content yet</p>
          <p className="text-sm">Fill out the form and click Generate to see a preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with actions */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "preview" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("preview")}
            >
              <Eye className="w-3 h-3 mr-1" /> Preview
            </Button>
            <Button
              variant={viewMode === "html" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("html")}
            >
              <Code className="w-3 h-3 mr-1" /> HTML
            </Button>
          </div>
          {status && (
            <Badge variant={status === "published" ? "default" : "secondary"}>
              {status}
            </Badge>
          )}
          {metadata?.subjectLine && (
            <span className="text-xs text-muted-foreground truncate max-w-48">
              Subject: {metadata.subjectLine}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
          {onSaveAsAsset && (
            <Button variant="ghost" size="sm" onClick={onSaveAsAsset}>
              <Save className="w-3 h-3 mr-1" /> Save
            </Button>
          )}
          {onPublish && (contentType === "landing_page" || contentType === "blog_post") && (
            <Button
              variant="default"
              size="sm"
              onClick={onPublish}
              disabled={isPublishing}
            >
              <Globe className="w-3 h-3 mr-1" /> Publish
            </Button>
          )}
          {onExport && (contentType === "ebook" || contentType === "solution_brief" || contentType === "blog_post") && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="w-3 h-3 mr-1" /> Export
            </Button>
          )}
        </div>
      </div>

      {/* Metadata bar */}
      {metadata && (
        <div className="flex items-center gap-3 px-3 py-2 border-b text-xs text-muted-foreground bg-muted/10">
          {metadata.seoTitle && <span>SEO: {metadata.seoTitle}</span>}
          {metadata.estimatedReadTime && <span>{metadata.estimatedReadTime}</span>}
          {metadata.estimatedPageCount && <span>{metadata.estimatedPageCount} pages</span>}
          {metadata.chapters?.length && <span>{metadata.chapters.length} chapters</span>}
          {metadata.sections?.length && <span>{metadata.sections.length} sections</span>}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {viewMode === "preview" ? (
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            title="Content Preview"
            sandbox="allow-same-origin"
          />
        ) : (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all bg-slate-950 text-slate-200 h-full overflow-auto">
            {htmlContent}
          </pre>
        )}
      </div>
    </div>
  );
}
