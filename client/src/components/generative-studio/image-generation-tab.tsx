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
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [generatedImages, setGeneratedImages] = useState<any[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [expandedImage, setExpandedImage] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isDisabled = !organizationId;

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
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r bg-muted/10 p-4 overflow-auto flex flex-col gap-4">
        {/* Header - Compact */}
        <div className="flex items-center gap-2 pb-2 border-b">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-100 text-violet-600">
            <ImageIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-semibold">Image Generation</span>
        </div>

        {/* Prompt Input - Clean */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Prompt</Label>
          <Textarea
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            disabled={isDisabled}
            className="resize-none text-sm focus-visible:ring-violet-500"
          />
        </div>

        {/* Advanced Settings Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between h-8 px-2 hover:bg-muted"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Settings2 className="w-3.5 h-3.5" />
            <span>Advanced Settings</span>
          </div>
          {showAdvanced ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </Button>

        {/* Collapsible Settings Area */}
        {showAdvanced && (
          <div className="space-y-4 pt-1 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Negative Prompt</Label>
              <Textarea
                placeholder="What to avoid..."
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
                disabled={isDisabled}
                className="resize-none text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Style</Label>
                <Select value={style} onValueChange={setStyle} disabled={isDisabled}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Aspect Ratio</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={isDisabled}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map((ar) => (
                        <SelectItem key={ar.value} value={ar.value} className="text-xs">{ar.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Count</Label>
                  <Select value={numberOfImages} onValueChange={setNumberOfImages} disabled={isDisabled}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1" className="text-xs">1 Image</SelectItem>
                      <SelectItem value="2" className="text-xs">2 Images</SelectItem>
                      <SelectItem value="3" className="text-xs">3 Images</SelectItem>
                      <SelectItem value="4" className="text-xs">4 Images</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <Button
          className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-sm mt-2"
          onClick={handleGenerate}
          disabled={generateMutation.isPending || !prompt || isDisabled}
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" /> Generate
            </>
          )}
        </Button>

        {isDisabled && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Select an organization first
          </div>
        )}

        {orgIntelligence?.identity?.legalName?.value && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-emerald-50/50 border border-emerald-100 mt-auto">
            <Brain className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-emerald-700 leading-tight">
                OI Active: {orgIntelligence.identity.legalName.value}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel - Results */}
      <div className="p-5 overflow-auto bg-muted/5">
        {generatedImages.length === 0 && !generateMutation.isPending && !generationError && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-4 max-w-xs">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mx-auto">
                <ImageIcon className="w-7 h-7 opacity-25" />
              </div>
              <div>
                <p className="text-base font-medium text-foreground/60">No images generated yet</p>
                <p className="text-sm text-muted-foreground mt-1">Enter a prompt and click Generate to create AI images</p>
              </div>
            </div>
          </div>
        )}

        {generationError && !generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-md">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mx-auto">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-base font-medium">Generation Failed</p>
              <p className="text-sm text-muted-foreground">{generationError}</p>
              <Button variant="outline" size="sm" onClick={() => setGenerationError(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                </div>
              </div>
              <div>
                <p className="text-base font-medium">Generating images...</p>
                <p className="text-sm text-muted-foreground mt-1">This may take up to 60 seconds</p>
              </div>
            </div>
          </div>
        )}

        {generatedImages.length > 0 && !generationError && !generateMutation.isPending && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {generatedImages.length} image{generatedImages.length !== 1 ? "s" : ""} generated
              </p>
            </div>
            <div className={cn(
              "grid gap-4",
              generatedImages.length === 1 ? "grid-cols-1 max-w-lg" : "grid-cols-1 md:grid-cols-2"
            )}>
              {generatedImages.map((img: any, i: number) => (
                <Card
                  key={i}
                  className={cn(
                    "overflow-hidden group cursor-pointer transition-shadow hover:shadow-lg",
                    expandedImage === i && "ring-2 ring-violet-500"
                  )}
                  onClick={() => setExpandedImage(expandedImage === i ? null : i)}
                >
                  <div className="relative aspect-square bg-muted">
                    {brokenImages.has(i) ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
                          <p className="text-xs text-muted-foreground">Image failed to load</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <img
                          src={img.url || img.thumbnailUrl}
                          alt={img.altText || `Generated image ${i + 1}`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          onError={() => handleImageError(i)}
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                        </div>
                      </>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {img.altText || prompt.slice(0, 50)}
                      </p>
                      {!brokenImages.has(i) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(img.url, i);
                          }}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
