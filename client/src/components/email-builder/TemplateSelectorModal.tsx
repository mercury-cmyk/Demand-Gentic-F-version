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
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Choose Email Template</DialogTitle>
            <DialogDescription>
              Start with a professional template or create from scratch
            </DialogDescription>
          </DialogHeader>

          {/* Search and Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates by name, subject, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList>
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category} className="capitalize">
                    {category === "all" ? "All Templates" : category}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Templates Grid */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No templates match your search" : "No templates available"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                {/* Start from Scratch Option */}
                <button
                  onClick={handleStartFromScratch}
                  className="border-2 border-dashed rounded-lg p-6 hover:border-primary hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-1">Start from Scratch</h3>
                    <p className="text-sm text-muted-foreground">
                      Create a custom email with the drag-and-drop builder
                    </p>
                  </div>
                </button>

                {/* Template Cards */}
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white"
                  >
                    {/* Template Preview Thumbnail */}
                    <div className="h-48 bg-muted/30 relative overflow-hidden group">
                      <iframe
                        title={`Preview of ${template.name}`}
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <meta charset="UTF-8">
                              <style>
                                body {
                                  margin: 0;
                                  padding: 10px;
                                  transform: scale(0.4);
                                  transform-origin: top left;
                                  width: 250%;
                                  font-family: Arial, sans-serif;
                                }
                                img { max-width: 100%; }
                              </style>
                            </head>
                            <body>${sanitizeHtmlForIframePreview(template.htmlContent)}</body>
                          </html>
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
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPreviewTemplate(template)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSelectTemplate(template)}
                        >
                          Use Template
                        </Button>
                      </div>
                    </div>

                    {/* Template Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm line-clamp-1">
                          {template.name}
                        </h3>
                        {template.isApproved && (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        )}
                      </div>

                      {template.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {template.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        {template.category && (
                          <Badge variant="outline" className="text-xs">
                            {template.category}
                          </Badge>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSelectTemplate(template)}
                          className="text-xs"
                        >
                          Use
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <TemplatePreviewModal
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
        template={previewTemplate}
        onUseTemplate={handleSelectTemplate}
      />
    </>
  );
}
