/**
 * AIImagePanel - AI-powered image generation panel
 *
 * Integrates with Vertex AI Imagen 3 for generating images
 */

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Wand2,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  Check,
  AlertCircle,
  Lightbulb,
  Copy,
  Download,
  RefreshCw,
} from 'lucide-react';

interface AIImagePanelProps {
  onImageGenerated: (imageUrl: string, altText: string) => void;
}

interface ImageStyle {
  id: string;
  name: string;
  description: string;
}

interface AspectRatio {
  id: string;
  name: string;
  dimensions: { width: number; height: number };
  useCase: string;
}

interface GeneratedImage {
  imageId: string;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
}

export function AIImagePanel({ onImageGenerated }: AIImagePanelProps) {
  // State
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string>('photorealistic');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('16:9');
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Fetch available styles
  const { data: styleData } = useQuery<{
    styles: ImageStyle[];
    aspectRatios: AspectRatio[];
  }>({
    queryKey: ['imageStyles'],
    queryFn: async () => {
      const res = await fetch('/api/email-builder/images/styles');
      if (!res.ok) throw new Error('Failed to fetch styles');
      return res.json();
    },
  });

  // Fetch prompt suggestions
  const { data: suggestions } = useQuery<{ suggestions: string[] }>({
    queryKey: ['promptSuggestions', 'hero'],
    queryFn: async () => {
      const res = await fetch('/api/email-builder/images/suggestions?category=hero');
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      return res.json();
    },
  });

  // Generate image mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/email-builder/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negativePrompt: negativePrompt || undefined,
          style: selectedStyle,
          aspectRatio: selectedAspectRatio,
          numberOfImages,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate image');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === 'completed' && data.images) {
        setGeneratedImages(data.images);
      } else if (data.jobId) {
        // Start polling for result
        setCurrentJobId(data.jobId);
        setIsPolling(true);
      }
    },
  });

  // Poll for job status
  useEffect(() => {
    if (!isPolling || !currentJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/email-builder/images/generate/${currentJobId}`);
        if (!res.ok) throw new Error('Failed to check status');

        const data = await res.json();

        if (data.status === 'completed') {
          setGeneratedImages(data.images || []);
          setIsPolling(false);
          setCurrentJobId(null);
        } else if (data.status === 'failed') {
          setIsPolling(false);
          setCurrentJobId(null);
        }
      } catch (error) {
        console.error('Polling error:', error);
        setIsPolling(false);
        setCurrentJobId(null);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isPolling, currentJobId]);

  // Use a suggestion
  const useSuggestion = (suggestion: string) => {
    setPrompt(suggestion);
  };

  // Select an image
  const selectImage = (image: GeneratedImage) => {
    // Generate alt text from prompt
    const altText = prompt.slice(0, 100);
    onImageGenerated(image.url, altText);
  };

  const isLoading = generateMutation.isPending || isPolling;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Prompt Input */}
        <div>
          <Label className="text-xs font-medium">Describe your image</Label>
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="A professional team collaborating in a modern office with natural light..."
            className="mt-2"
            rows={4}
          />
          <p className="text-xs text-slate-500 mt-1">
            Be specific about what you want. Include details about style, lighting, and composition.
          </p>
        </div>

        {/* Suggestions */}
        {suggestions?.suggestions && (
          <div>
            <Label className="text-xs font-medium flex items-center gap-1">
              <Lightbulb className="w-3 h-3" />
              Quick Suggestions
            </Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {suggestions.suggestions.slice(0, 4).map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => useSuggestion(suggestion)}
                  className="text-xs px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 truncate max-w-[200px]"
                  title={suggestion}
                >
                  {suggestion.slice(0, 40)}...
                </button>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Style Selection */}
        <div>
          <Label className="text-xs font-medium">Style</Label>
          <Select value={selectedStyle} onValueChange={setSelectedStyle}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select style" />
            </SelectTrigger>
            <SelectContent>
              {styleData?.styles?.map(style => (
                <SelectItem key={style.id} value={style.id}>
                  <div className="flex flex-col">
                    <span>{style.name}</span>
                    <span className="text-xs text-slate-500">{style.description}</span>
                  </div>
                </SelectItem>
              )) || (
                <>
                  <SelectItem value="photorealistic">Photorealistic</SelectItem>
                  <SelectItem value="illustration">Illustration</SelectItem>
                  <SelectItem value="abstract">Abstract</SelectItem>
                  <SelectItem value="minimalist">Minimalist</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Aspect Ratio */}
        <div>
          <Label className="text-xs font-medium">Aspect Ratio</Label>
          <Select value={selectedAspectRatio} onValueChange={setSelectedAspectRatio}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              {styleData?.aspectRatios?.map(ar => (
                <SelectItem key={ar.id} value={ar.id}>
                  <div className="flex items-center gap-2">
                    <span>{ar.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {ar.dimensions.width}x{ar.dimensions.height}
                    </Badge>
                  </div>
                </SelectItem>
              )) || (
                <>
                  <SelectItem value="16:9">Widescreen (16:9)</SelectItem>
                  <SelectItem value="1:1">Square (1:1)</SelectItem>
                  <SelectItem value="4:3">Standard (4:3)</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Negative Prompt (Advanced) */}
        <div>
          <Label className="text-xs font-medium">Negative Prompt (Optional)</Label>
          <Input
            value={negativePrompt}
            onChange={e => setNegativePrompt(e.target.value)}
            placeholder="Things to avoid in the image..."
            className="mt-2"
          />
          <p className="text-xs text-slate-500 mt-1">
            Describe what you don't want in the image
          </p>
        </div>

        {/* Generate Button */}
        <Button
          className="w-full"
          onClick={() => generateMutation.mutate()}
          disabled={!prompt.trim() || isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Image
            </>
          )}
        </Button>

        {/* Progress/Status */}
        {isLoading && (
          <div className="space-y-2">
            <Progress value={isPolling ? 66 : 33} />
            <p className="text-xs text-center text-slate-500">
              {isPolling ? 'Processing your image...' : 'Sending request...'}
            </p>
          </div>
        )}

        {/* Error */}
        {generateMutation.isError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{generateMutation.error?.message || 'Failed to generate image'}</span>
          </div>
        )}

        <Separator />

        {/* Generated Images */}
        {generatedImages.length > 0 && (
          <div>
            <Label className="text-xs font-medium flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              Generated Images
            </Label>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {generatedImages.map(image => (
                <div
                  key={image.imageId}
                  className="relative group rounded-lg overflow-hidden border cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                  onClick={() => selectImage(image)}
                >
                  <img
                    src={image.thumbnailUrl || image.url}
                    alt="Generated"
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="sm" variant="secondary">
                      <Check className="w-4 h-4 mr-1" />
                      Use This
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => generateMutation.mutate()}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate More
            </Button>
          </div>
        )}

        {/* Tips */}
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-slate-700">Tips for better results:</p>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>• Be specific about lighting (natural, studio, soft)</li>
            <li>• Mention the intended use (email header, product shot)</li>
            <li>• Include style references (modern, minimalist, vibrant)</li>
            <li>• Describe the mood or feeling you want</li>
          </ul>
        </div>
      </div>
    </ScrollArea>
  );
}

export default AIImagePanel;
