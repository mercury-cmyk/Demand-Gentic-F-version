import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Sparkles, Download, Image } from "lucide-react";

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
  { value: "1:1", label: "1:1 (Square)" },
  { value: "16:9", label: "16:9 (Widescreen)" },
  { value: "4:3", label: "4:3 (Standard)" },
  { value: "3:4", label: "3:4 (Portrait)" },
  { value: "9:16", label: "9:16 (Story)" },
];

interface ImageGenerationTabProps {
  brandKits?: any[];
}

export default function ImageGenerationTab({ brandKits }: ImageGenerationTabProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [style, setStyle] = useState("photorealistic");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [numberOfImages, setNumberOfImages] = useState("1");
  const [generatedImages, setGeneratedImages] = useState<any[]>([]);

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/email-builder/images/generate", data);
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.images) {
        setGeneratedImages(data.images);
      } else if (data.job) {
        toast({ title: "Image generation started", description: "Your images are being generated. Check back shortly." });
      }
      toast({ title: "Images generated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    if (!prompt) return;
    generateMutation.mutate({
      prompt,
      negativePrompt: negativePrompt || undefined,
      style,
      aspectRatio,
      numberOfImages: parseInt(numberOfImages),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r p-6 overflow-auto space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600">
            <Image className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Image Generation</h2>
            <p className="text-xs text-muted-foreground">Powered by Vertex AI Imagen 3</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Prompt</Label>
          <Textarea
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label>Negative Prompt (optional)</Label>
          <Textarea
            placeholder="Describe what to avoid..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((ar) => (
                  <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Number of Images</Label>
          <Select value={numberOfImages} onValueChange={setNumberOfImages}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Image</SelectItem>
              <SelectItem value="2">2 Images</SelectItem>
              <SelectItem value="3">3 Images</SelectItem>
              <SelectItem value="4">4 Images</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full"
          onClick={handleGenerate}
          disabled={generateMutation.isPending || !prompt}
          size="lg"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" /> Generate Images
            </>
          )}
        </Button>
      </div>

      {/* Right panel - Results */}
      <div className="p-6 overflow-auto">
        {generatedImages.length === 0 && !generateMutation.isPending && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <Image className="w-16 h-16 mx-auto opacity-20" />
              <p className="text-lg font-medium">No images generated yet</p>
              <p className="text-sm">Enter a prompt and click Generate to create AI images</p>
            </div>
          </div>
        )}

        {generateMutation.isPending && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-violet-500" />
              <p className="text-lg font-medium">Generating images...</p>
              <p className="text-sm text-muted-foreground">This may take a moment</p>
            </div>
          </div>
        )}

        {generatedImages.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {generatedImages.map((img: any, i: number) => (
              <Card key={i} className="overflow-hidden">
                <div className="relative aspect-square bg-muted">
                  <img
                    src={img.url || img.thumbnailUrl}
                    alt={img.altText || `Generated image ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {img.altText || prompt.slice(0, 50)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = img.url;
                        a.download = `generated-image-${i + 1}.png`;
                        a.target = "_blank";
                        a.click();
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
