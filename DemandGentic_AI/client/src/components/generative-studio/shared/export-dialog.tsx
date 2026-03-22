import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, FileText, Code } from "lucide-react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content?: string;
  contentHtml?: string;
  title: string;
  contentType: string;
}

export default function ExportDialog({
  open,
  onOpenChange,
  content,
  contentHtml,
  title,
  contentType,
}: ExportDialogProps) {
  const handleExportHtml = () => {
    const blob = new Blob([contentHtml || content || ""], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const blob = new Blob([content || ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    // Strip HTML tags for plain text
    const temp = document.createElement("div");
    temp.innerHTML = contentHtml || content || "";
    const text = temp.textContent || temp.innerText || "";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    
      
        
          Export Content
          
            Choose a format to download your content.
          
        

        
          
            
            
              HTML File
              Download as .html with full formatting
            
          

          {content && (
            
              
              
                Markdown File
                Download as .md for further editing
              
            
          )}

          
            
            
              Plain Text
              Download as .txt without formatting
            
          
        

        
           onOpenChange(false)}>
            Close
          
        
      
    
  );
}