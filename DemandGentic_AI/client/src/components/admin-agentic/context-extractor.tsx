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
  extractedData?: Record;
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
        return ;
      case "document":
        return ;
      case "text":
        return ;
    }
  };

  const getStatusBadge = (source: ContextSource) => {
    switch (source.status) {
      case "pending":
        return Pending;
      case "processing":
        return (
          
            
            Processing
          
        );
      case "extracted":
        return (
          
            
            Extracted
          
        );
      case "error":
        return (
          
            
            Error
          
        );
    }
  };

  return (
    
      
        
          
          Context Sources
        
        
          Add URLs, documents, or text to extract campaign context
        
      
      
        
          
            
              
              URL
            
            
              
              Document
            
            
              
              Text
            
          

          
            
               setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
              />
              
                Add
              
            
          

          
            
              
              
              {isDragActive ? (
                Drop files here...
              ) : (
                <>
                  
                    Drag & drop files here, or click to select
                  
                  
                    PDF, DOC, DOCX, TXT (max 10MB)
                  
                
              )}
            
          

          
             setTextInput(e.target.value)}
              rows={4}
            />
            
              Add Text
            
          
        

        {/* Source List */}
        {sources.length > 0 && (
          
            
              Added Sources ({sources.length})
            
            
              {sources.map((source) => (
                
                  
                    {getSourceIcon(source)}
                  
                  
                    {source.name}
                    {source.error && (
                      {source.error}
                    )}
                  
                  
                    {getStatusBadge(source)}
                    {source.type === "url" && (
                       window.open(source.name, "_blank")}
                      >
                        
                      
                    )}
                    {source.status === "pending" && (
                       onAnalyzeSource(source.id)}
                        disabled={isAnalyzing}
                      >
                        Analyze
                      
                    )}
                     onRemoveSource(source.id)}
                    >
                      
                    
                  
                
              ))}
            
          
        )}
      
    
  );
}

export default ContextExtractor;