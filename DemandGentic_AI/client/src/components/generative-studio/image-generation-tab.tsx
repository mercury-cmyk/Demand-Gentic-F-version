import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Sparkles,
  Download,
  Image as ImageIcon,
  AlertTriangle,
  Brain,
  AlertCircle,
  ZoomIn,
  Settings2,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Globe,
  Mail,
  FileText,
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

function getOiValue(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.value || "";
}

const IMAGE_STYLES = [
  { value: "photorealistic", label: "Photorealistic" },
  { value: "illustration", label: "Illustration" },
  { value: "abstract", label: "Abstract" },
  { value: "minimalist", label: "Minimalist" },
  { value: "corporate", label: "Corporate" },
  { value: "tech", label: "Tech" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "flat_design", label: "Flat Design" },
  { value: "3d_render", label: "3D Render" },
  { value: "watercolor", label: "Watercolor" },
  { value: "isometric", label: "Isometric" },
];

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "16:9", label: "Widescreen (16:9)" },
  { value: "4:3", label: "Standard (4:3)" },
  { value: "3:4", label: "Portrait (3:4)" },
  { value: "9:16", label: "Story (9:16)" },
];

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface ImageGenerationTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function ImageGenerationTab({
  orgIntelligence,
  organizationId,
  clientProjectId,
}: ImageGenerationTabProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [style, setStyle] = useState("photorealistic");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [numberOfImages, setNumberOfImages] = useState("1");
  const [generatedImages, setGeneratedImages] = useState([]);
  const [generationError, setGenerationError] = useState(null);
  const [brokenImages, setBrokenImages] = useState>(new Set());
  const [expandedImage, setExpandedImage] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasOrgIntel = !!getOiValue(orgIntelligence?.identity?.legalName);
  const isDisabled = !organizationId || !hasOrgIntel;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/email-builder/images/generate", data, { timeout: 120000 });
      return await res.json();
    },
    onSuccess: (data) => {
      setGenerationError(null);
      setBrokenImages(new Set());

      if (data.success === false) {
        setGenerationError(data.error || "Image generation failed. Please try a different prompt.");
        toast({ title: "Generation failed", description: data.error || "Please try a different prompt.", variant: "destructive" });
        return;
      }

      if (data.images && data.images.length > 0) {
        setGeneratedImages(data.images);
        toast({ title: "Images generated successfully" });
      } else {
        setGenerationError("No images were returned. The AI may have rejected this prompt — try rephrasing.");
        toast({ title: "No images generated", description: "Try rephrasing your prompt.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      setGenerationError(error.message || "Request failed. Please try again.");
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    if (!prompt) return;
    setGenerationError(null);
    setBrokenImages(new Set());
    generateMutation.mutate({
      prompt,
      negativePrompt: negativePrompt || undefined,
      style,
      aspectRatio,
      numberOfImages: parseInt(numberOfImages),
      organizationId,
      clientProjectId,
    });
  };

  const handleImageError = (index: number) => {
    setBrokenImages((prev) => new Set(prev).add(index));
  };

  const handleDownload = async (imageUrl: string, index: number) => {
    try {
      const response = await fetch(imageUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-image-${index + 1}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not download the image.", variant: "destructive" });
    }
  };

  return (
    
      {/* Left panel - Form */}
      
        {/* Header - Compact */}
        
          
            
          
          Image Generation
        

        {/* Prompt Input - Clean */}
        
          Prompt
           setPrompt(e.target.value)}
            rows={3}
            disabled={isDisabled}
            className="resize-none text-sm focus-visible:ring-violet-500"
          />
        

        {/* Advanced Settings Toggle */}
         setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between h-8 px-2 hover:bg-muted"
        >
          
            
            Advanced Settings
          
          {showAdvanced ? (
            
          ) : (
            
          )}
        

        {/* Collapsible Settings Area */}
        {showAdvanced && (
          
            
              Negative Prompt
               setNegativePrompt(e.target.value)}
                rows={2}
                disabled={isDisabled}
                className="resize-none text-xs"
              />
            

            
              
                Style
                
                  
                    
                  
                  
                    {IMAGE_STYLES.map((s) => (
                      {s.label}
                    ))}
                  
                
              

              
                
                  Aspect Ratio
                  
                    
                      
                    
                    
                      {ASPECT_RATIOS.map((ar) => (
                        {ar.label}
                      ))}
                    
                  
                
                
                  Count
                  
                    
                      
                    
                    
                      1 Image
                      2 Images
                      3 Images
                      4 Images
                    
                  
                
              
            
          
        )}

        {/* Generate Button */}
        
          {generateMutation.isPending ? (
            <>
               Generating...
            
          ) : (
            <>
               Generate
            
          )}
        

        {isDisabled && (
          
            
            
              Organizational Intelligence Required
              
                {!organizationId 
                  ? "Select an organization to generate images."
                  : "Complete the Organization Intelligence profile before generating images. All outputs must reflect brand identity."}
              
            
          
        )}

        {getOiValue(orgIntelligence?.identity?.legalName) && (
          
            
            
              
                OI Active: {getOiValue(orgIntelligence?.identity?.legalName)}
              
            
          
        )}
      

      {/* Right panel - Results */}
      
        {generatedImages.length === 0 && !generateMutation.isPending && !generationError && (
          
            
              
                
              
              
                No images generated yet
                Enter a prompt and click Generate to create AI images
              
            
          
        )}

        {generationError && !generateMutation.isPending && (
          
            
              
                
              
              Generation Failed
              {generationError}
               setGenerationError(null)}>
                Dismiss
              
            
          
        )}

        {generateMutation.isPending && (
          
            
              
                
                  
                
              
              
                Generating images...
                This may take up to 60 seconds
              
            
          
        )}

        {generatedImages.length > 0 && !generationError && !generateMutation.isPending && (
          
            
              
                {generatedImages.length} image{generatedImages.length !== 1 ? "s" : ""} generated
              
            
            
              {generatedImages.map((img: any, i: number) => (
                 setExpandedImage(expandedImage === i ? null : i)}
                >
                  
                    {brokenImages.has(i) ? (
                      
                        
                          
                          Image failed to load
                        
                      
                    ) : (
                      <>
                         handleImageError(i)}
                        />
                        {/* Hover overlay */}
                        
                          
                        
                      
                    )}
                  
                  
                    
                      
                        {img.altText || prompt.slice(0, 50)}
                      
                      {!brokenImages.has(i) && (
                        
                           {
                              e.stopPropagation();
                              handleDownload(img.url, i);
                            }}
                          >
                            
                          
                          
                            
                               e.stopPropagation()}>
                                
                              
                            
                            
                               { e.stopPropagation(); toast({ title: "Added to Landing Page", description: "Image is now available in Landing Page builder." }); }}>
                                 Use in Landing Page
                              
                               { e.stopPropagation(); toast({ title: "Added to Email Template", description: "Image is now available in Email builder." }); }}>
                                 Use in Email Template
                              
                               { e.stopPropagation(); toast({ title: "Added to Blog Post", description: "Image is now available in Blog Post builder." }); }}>
                                 Use in Blog Post
                              
                               { e.stopPropagation(); toast({ title: "Added to eBook", description: "Image is now available in eBook builder." }); }}>
                                 Use in eBook
                              
                            
                          
                        
                      )}
                    
                  
                
              ))}
            
          
        )}
      
    
  );
}