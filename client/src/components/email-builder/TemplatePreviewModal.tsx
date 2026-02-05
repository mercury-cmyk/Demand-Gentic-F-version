import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";

interface EmailTemplate {
  id: string;
  name: string;
  description?: string;
  subject: string;
  htmlContent: string;
  designJson?: any;
  category?: string;
  isApproved?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplate | null;
  onUseTemplate?: (template: EmailTemplate) => void;
}

export function TemplatePreviewModal({
  open,
  onOpenChange,
  template,
  onUseTemplate
}: TemplatePreviewModalProps) {
  if (!template) return null;

  const handleUseTemplate = () => {
    onUseTemplate?.(template);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {template.description || "No description provided"}
          </DialogDescription>
        </DialogHeader>

        {/* Template Metadata */}
        <div className="flex flex-wrap items-center gap-3 py-3 border-b">
          {template.category && (
            <Badge variant="secondary">{template.category}</Badge>
          )}

          {template.isApproved && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Approved
            </Badge>
          )}

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            Updated {format(new Date(template.updatedAt), "MMM d, yyyy")}
          </div>

          {template.createdBy && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              By {template.createdBy}
            </div>
          )}
        </div>

        {/* Subject Line */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Subject Line</p>
          <p className="text-sm border rounded-md p-2 bg-muted/20">
            {template.subject}
          </p>
        </div>

        {/* Email Preview */}
        <div className="flex-1 overflow-hidden border rounded-md bg-muted/20">
          <div className="h-full overflow-y-auto bg-white">
            <iframe
              title="Template Preview"
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                      body {
                        margin: 0;
                        padding: 20px;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                        background-color: #f9fafb;
                      }
                      img {
                        max-width: 100%;
                        height: auto;
                      }
                    </style>
                  </head>
                  <body>
                    ${sanitizeHtmlForIframePreview(template.htmlContent)}
                  </body>
                </html>
              `}
              style={{
                width: "100%",
                height: "100%",
                border: "none"
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUseTemplate}>
            Use This Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
