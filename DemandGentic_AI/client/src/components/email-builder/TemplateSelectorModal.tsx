import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, CheckCircle2, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TemplatePreviewModal } from "./TemplatePreviewModal";
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

interface TemplateSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: EmailTemplate) => void;
}

export function TemplateSelectorModal({
  open,
  onOpenChange,
  onSelectTemplate
}: TemplateSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['/api/email-templates'],
    enabled: open,
  });

  // Get unique categories
  const categories = [
    "all",
    ...new Set(
      templates
        .map((t) => t.category)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = !searchQuery ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.subject.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleSelectTemplate = (template: EmailTemplate) => {
    onSelectTemplate(template);
    onOpenChange(false);
  };

  const handleStartFromScratch = () => {
    onSelectTemplate({
      id: "",
      name: "New Email",
      subject: "",
      htmlContent: "",
      designJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    onOpenChange(false);
  };

  return (
    <>
      
        
          
            Choose Email Template
            
              Start with a professional template or create from scratch
            
          

          {/* Search and Filter */}
          
            
              
               setSearchQuery(e.target.value)}
                className="pl-9"
              />
            

            
              
                {categories.map((category) => (
                  
                    {category === "all" ? "All Templates" : category}
                  
                ))}
              
            
          

          {/* Templates Grid */}
          
            {isLoading ? (
              
                Loading templates...
              
            ) : filteredTemplates.length === 0 ? (
              
                
                  
                  
                    {searchQuery ? "No templates match your search" : "No templates available"}
                  
                
              
            ) : (
              
                {/* Start from Scratch Option */}
                
                  
                    
                      
                    
                    Start from Scratch
                    
                      Create a custom email with the drag-and-drop builder
                    
                  
                

                {/* Template Cards */}
                {filteredTemplates.map((template) => (
                  
                    {/* Template Preview Thumbnail */}
                    
                      
                          
                            
                              
                              
                                body {
                                  margin: 0;
                                  padding: 10px;
                                  transform: scale(0.4);
                                  transform-origin: top left;
                                  width: 250%;
                                  font-family: Arial, sans-serif;
                                }
                                img { max-width: 100%; }
                              
                            
                            ${sanitizeHtmlForIframePreview(template.htmlContent)}
                          
                        `}
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                          pointerEvents: "none"
                        }}
                        sandbox="allow-same-origin allow-scripts"
                      />

                      {/* Overlay with actions */}
                      
                         setPreviewTemplate(template)}
                        >
                          
                          Preview
                        
                         handleSelectTemplate(template)}
                        >
                          Use Template
                        
                      
                    

                    {/* Template Info */}
                    
                      
                        
                          {template.name}
                        
                        {template.isApproved && (
                          
                        )}
                      

                      {template.description && (
                        
                          {template.description}
                        
                      )}

                      
                        {template.category && (
                          
                            {template.category}
                          
                        )}

                         handleSelectTemplate(template)}
                          className="text-xs"
                        >
                          Use
                        
                      
                    
                  
                ))}
              
            )}
          
        
      

      {/* Preview Modal */}
       !open && setPreviewTemplate(null)}
        template={previewTemplate}
        onUseTemplate={handleSelectTemplate}
      />
    
  );
}