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
    
      
        
          {template.name}
          
            {template.description || "No description provided"}
          
        

        {/* Template Metadata */}
        
          {template.category && (
            {template.category}
          )}

          {template.isApproved && (
            
              
              Approved
            
          )}

          
            
            Updated {format(new Date(template.updatedAt), "MMM d, yyyy")}
          

          {template.createdBy && (
            
              
              By {template.createdBy}
            
          )}
        

        {/* Subject Line */}
        
          Subject Line
          
            {template.subject}
          
        

        {/* Email Preview */}
        
          
            
                
                  
                    
                    
                    
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
                    
                  
                  
                    ${sanitizeHtmlForIframePreview(template.htmlContent)}
                  
                
              `}
              style={{
                width: "100%",
                height: "100%",
                border: "none"
              }}
              sandbox="allow-same-origin allow-scripts"
            />
          
        

        
           onOpenChange(false)}>
            Cancel
          
          
            Use This Template
          
        
      
    
  );
}