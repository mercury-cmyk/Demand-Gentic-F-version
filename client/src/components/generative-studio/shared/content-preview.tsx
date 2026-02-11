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
  Sparkles,
  FileText,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  const [deviceView, setDeviceView] = useState<"desktop" | "tablet" | "mobile">("desktop");
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

  const iframeWidthClass =
    deviceView === "mobile"
      ? "max-w-[375px]"
      : deviceView === "tablet"
      ? "max-w-[768px]"
      : "max-w-full";

  if (!htmlContent) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/10">
        <div className="text-center space-y-4 max-w-xs">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mx-auto">
            <Sparkles className="w-7 h-7 opacity-30" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground/60">No content yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Fill out the form and click Generate to see a live preview here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border bg-background p-0.5">
            <Button
              variant={viewMode === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs rounded-md"
              onClick={() => setViewMode("preview")}
            >
              <Eye className="w-3.5 h-3.5 mr-1" /> Preview
            </Button>
            <Button
              variant={viewMode === "html" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs rounded-md"
              onClick={() => setViewMode("html")}
            >
              <Code className="w-3.5 h-3.5 mr-1" /> HTML
            </Button>
          </div>

          {/* Device Preview Toggle (only in preview mode) */}
          {viewMode === "preview" && (
            <div className="flex rounded-lg border bg-background p-0.5 ml-1">
              <Button
                variant={deviceView === "desktop" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0 rounded-md"
                onClick={() => setDeviceView("desktop")}
              >
                <Monitor className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={deviceView === "tablet" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0 rounded-md"
                onClick={() => setDeviceView("tablet")}
              >
                <Tablet className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={deviceView === "mobile" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0 rounded-md"
                onClick={() => setDeviceView("mobile")}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {status && (
            <Badge
              variant={status === "published" ? "default" : "secondary"}
              className="text-[10px] h-5"
            >
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
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCopy}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          {onSaveAsAsset && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onSaveAsAsset}>
              <Save className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          )}
          {onPublish && (contentType === "landing_page" || contentType === "blog_post") && (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              onClick={onPublish}
              disabled={isPublishing}
            >
              <Globe className="w-3.5 h-3.5 mr-1" /> Publish
            </Button>
          )}
          {onExport && (contentType === "ebook" || contentType === "solution_brief" || contentType === "blog_post") && (
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={onExport}>
              <Download className="w-3.5 h-3.5 mr-1" /> Export
            </Button>
          )}
        </div>
      </div>

      {/* Metadata bar */}
      {metadata && (metadata.seoTitle || metadata.estimatedReadTime || metadata.estimatedPageCount || metadata.chapters?.length || metadata.sections?.length) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[11px] text-muted-foreground bg-muted/10">
          {metadata.seoTitle && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> {metadata.seoTitle}
            </span>
          )}
          {metadata.estimatedReadTime && <span>{metadata.estimatedReadTime}</span>}
          {metadata.estimatedPageCount && <span>{metadata.estimatedPageCount} pages</span>}
          {metadata.chapters?.length && <span>{metadata.chapters.length} chapters</span>}
          {metadata.sections?.length && <span>{metadata.sections.length} sections</span>}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto bg-muted/5">
        {viewMode === "preview" ? (
          <div className={cn("mx-auto h-full transition-all duration-200", iframeWidthClass)}>
            <iframe
              ref={iframeRef}
              className={cn(
                "w-full h-full border-0",
                deviceView !== "desktop" && "border-x shadow-lg"
              )}
              title="Content Preview"
              sandbox="allow-same-origin"
            />
          </div>
        ) : (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all bg-slate-950 text-slate-200 h-full overflow-auto leading-relaxed">
            {htmlContent}
          </pre>
        )}
      </div>
    </div>
  );
}
