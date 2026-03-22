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
  metadata?: Record;
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
  const [viewMode, setViewMode] = useState("preview");
  const [copied, setCopied] = useState(false);
  const [deviceView, setDeviceView] = useState("desktop");
  const iframeRef = useRef(null);
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
      
        
          
            
          
          
            No content yet
            
              Fill out the form and click Generate to see a live preview here
            
          
        
      
    );
  }

  return (
    
      {/* Toolbar */}
      
        
          {/* View Mode Toggle */}
          
             setViewMode("preview")}
            >
               Preview
            
             setViewMode("html")}
            >
               HTML
            
          

          {/* Device Preview Toggle (only in preview mode) */}
          {viewMode === "preview" && (
            
               setDeviceView("desktop")}
              >
                
              
               setDeviceView("tablet")}
              >
                
              
               setDeviceView("mobile")}
              >
                
              
            
          )}

          {status && (
            
              {status}
            
          )}
          {metadata?.subjectLine && (
            
              Subject: {metadata.subjectLine}
            
          )}
        

        
          
            {copied ?  : }
          
          {onSaveAsAsset && (
            
               Save
            
          )}
          {onPublish && (contentType === "landing_page" || contentType === "blog_post" || contentType === "ebook" || contentType === "solution_brief") && (
            
               Publish
            
          )}
          {onExport && (contentType === "ebook" || contentType === "solution_brief" || contentType === "blog_post") && (
            
               Export
            
          )}
        
      

      {/* Metadata bar */}
      {metadata && (metadata.seoTitle || metadata.estimatedReadTime || metadata.estimatedPageCount || metadata.chapters?.length || metadata.sections?.length) && (
        
          {metadata.seoTitle && (
            
               {metadata.seoTitle}
            
          )}
          {metadata.estimatedReadTime && {metadata.estimatedReadTime}}
          {metadata.estimatedPageCount && {metadata.estimatedPageCount} pages}
          {metadata.chapters?.length && {metadata.chapters.length} chapters}
          {metadata.sections?.length && {metadata.sections.length} sections}
        
      )}

      {/* Content area */}
      
        {viewMode === "preview" ? (
          
            
          
        ) : (
          
            {htmlContent}
          
        )}
      
    
  );
}