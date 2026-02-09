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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Content</DialogTitle>
          <DialogDescription>
            Choose a format to download your content.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Button
            variant="outline"
            className="justify-start h-auto py-3"
            onClick={handleExportHtml}
          >
            <Code className="w-5 h-5 mr-3" />
            <div className="text-left">
              <p className="font-medium">HTML File</p>
              <p className="text-xs text-muted-foreground">Download as .html with full formatting</p>
            </div>
          </Button>

          {content && (
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              onClick={handleExportMarkdown}
            >
              <FileText className="w-5 h-5 mr-3" />
              <div className="text-left">
                <p className="font-medium">Markdown File</p>
                <p className="text-xs text-muted-foreground">Download as .md for further editing</p>
              </div>
            </Button>
          )}

          <Button
            variant="outline"
            className="justify-start h-auto py-3"
            onClick={handleExportText}
          >
            <Download className="w-5 h-5 mr-3" />
            <div className="text-left">
              <p className="font-medium">Plain Text</p>
              <p className="text-xs text-muted-foreground">Download as .txt without formatting</p>
            </div>
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
