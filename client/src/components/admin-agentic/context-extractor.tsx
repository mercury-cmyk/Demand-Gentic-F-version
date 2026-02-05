import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Link,
  Upload,
  FileText,
  Loader2,
  Check,
  X,
  Globe,
  File,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";

export interface ContextSource {
  id: string;
  type: "url" | "document" | "text";
  name: string;
  content?: string;
  status: "pending" | "processing" | "extracted" | "error";
  extractedData?: Record<string, any>;
  error?: string;
}

interface ContextExtractorProps {
  sources: ContextSource[];
  onAddUrl: (url: string) => void;
  onAddDocument: (file: File) => void;
  onAddText: (text: string) => void;
  onRemoveSource: (id: string) => void;
  onAnalyzeSource: (id: string) => void;
  isAnalyzing?: boolean;
  className?: string;
}

export function ContextExtractor({
  sources,
  onAddUrl,
  onAddDocument,
  onAddText,
  onRemoveSource,
  onAnalyzeSource,
  isAnalyzing,
  className,
}: ContextExtractorProps) {
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState("url");

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => onAddDocument(file));
    },
    [onAddDocument]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleAddUrl = () => {
    if (urlInput.trim()) {
      onAddUrl(urlInput.trim());
      setUrlInput("");
    }
  };

  const handleAddText = () => {
    if (textInput.trim()) {
      onAddText(textInput.trim());
      setTextInput("");
    }
  };

  const getSourceIcon = (source: ContextSource) => {
    switch (source.type) {
      case "url":
        return <Globe className="h-4 w-4" />;
      case "document":
        return <File className="h-4 w-4" />;
      case "text":
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (source: ContextSource) => {
    switch (source.status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "processing":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-600">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case "extracted":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-600">
            <Check className="h-3 w-3 mr-1" />
            Extracted
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-600">
            <X className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link className="h-4 w-4" />
          Context Sources
        </CardTitle>
        <CardDescription>
          Add URLs, documents, or text to extract campaign context
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="url" className="text-xs">
              <Globe className="h-3 w-3 mr-1" />
              URL
            </TabsTrigger>
            <TabsTrigger value="document" className="text-xs">
              <Upload className="h-3 w-3 mr-1" />
              Document
            </TabsTrigger>
            <TabsTrigger value="text" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="mt-3">
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/product-page"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
              />
              <Button onClick={handleAddUrl} disabled={!urlInput.trim()}>
                Add
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="document" className="mt-3">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-sm text-primary">Drop files here...</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Drag & drop files here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOC, DOCX, TXT (max 10MB)
                  </p>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="text" className="mt-3 space-y-2">
            <Textarea
              placeholder="Paste product description, campaign brief, or any relevant text..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={4}
            />
            <Button
              onClick={handleAddText}
              disabled={!textInput.trim()}
              className="w-full"
            >
              Add Text
            </Button>
          </TabsContent>
        </Tabs>

        {/* Source List */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Added Sources ({sources.length})
            </div>
            <div className="space-y-2 max-h-48 overflow-auto">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    source.status === "error" && "border-red-200 bg-red-50/50",
                    source.status === "extracted" && "border-green-200 bg-green-50/50"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center",
                      source.type === "url" && "bg-blue-100 text-blue-600",
                      source.type === "document" && "bg-amber-100 text-amber-600",
                      source.type === "text" && "bg-purple-100 text-purple-600"
                    )}
                  >
                    {getSourceIcon(source)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{source.name}</p>
                    {source.error && (
                      <p className="text-xs text-red-600">{source.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(source)}
                    {source.type === "url" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(source.name, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {source.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAnalyzeSource(source.id)}
                        disabled={isAnalyzing}
                      >
                        Analyze
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveSource(source.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ContextExtractor;
