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
  const [selectedStyle, setSelectedStyle] = useState('photorealistic');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('16:9');
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);

  // Fetch available styles
  const { data: styleData } = useQuery({
    queryKey: ['imageStyles'],
    queryFn: async () => {
      const res = await fetch('/api/email-builder/images/styles');
      if (!res.ok) throw new Error('Failed to fetch styles');
      return res.json();
    },
  });

  // Fetch prompt suggestions
  const { data: suggestions } = useQuery({
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
    
      
        {/* Prompt Input */}
        
          Describe your image
           setPrompt(e.target.value)}
            placeholder="A professional team collaborating in a modern office with natural light..."
            className="mt-2"
            rows={4}
          />
          
            Be specific about what you want. Include details about style, lighting, and composition.
          
        

        {/* Suggestions */}
        {suggestions?.suggestions && (
          
            
              
              Quick Suggestions
            
            
              {suggestions.suggestions.slice(0, 4).map((suggestion, i) => (
                 useSuggestion(suggestion)}
                  className="text-xs px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 truncate max-w-[200px]"
                  title={suggestion}
                >
                  {suggestion.slice(0, 40)}...
                
              ))}
            
          
        )}

        

        {/* Style Selection */}
        
          Style
          
            
              
            
            
              {styleData?.styles?.map(style => (
                
                  
                    {style.name}
                    {style.description}
                  
                
              )) || (
                <>
                  Photorealistic
                  Illustration
                  Abstract
                  Minimalist
                  Corporate
                
              )}
            
          
        

        {/* Aspect Ratio */}
        
          Aspect Ratio
          
            
              
            
            
              {styleData?.aspectRatios?.map(ar => (
                
                  
                    {ar.name}
                    
                      {ar.dimensions.width}x{ar.dimensions.height}
                    
                  
                
              )) || (
                <>
                  Widescreen (16:9)
                  Square (1:1)
                  Standard (4:3)
                
              )}
            
          
        

        {/* Negative Prompt (Advanced) */}
        
          Negative Prompt (Optional)
           setNegativePrompt(e.target.value)}
            placeholder="Things to avoid in the image..."
            className="mt-2"
          />
          
            Describe what you don't want in the image
          
        

        {/* Generate Button */}
         generateMutation.mutate()}
          disabled={!prompt.trim() || isLoading}
        >
          {isLoading ? (
            <>
              
              Generating...
            
          ) : (
            <>
              
              Generate Image
            
          )}
        

        {/* Progress/Status */}
        {isLoading && (
          
            
            
              {isPolling ? 'Processing your image...' : 'Sending request...'}
            
          
        )}

        {/* Error */}
        {generateMutation.isError && (
          
            
            {generateMutation.error?.message || 'Failed to generate image'}
          
        )}

        

        {/* Generated Images */}
        {generatedImages.length > 0 && (
          
            
              
              Generated Images
            
            
              {generatedImages.map(image => (
                 selectImage(image)}
                >
                  
                  
                    
                      
                      Use This
                    
                  
                
              ))}
            
             generateMutation.mutate()}
              disabled={isLoading}
            >
              
              Generate More
            
          
        )}

        {/* Tips */}
        
          Tips for better results:
          
            • Be specific about lighting (natural, studio, soft)
            • Mention the intended use (email header, product shot)
            • Include style references (modern, minimalist, vibrant)
            • Describe the mood or feeling you want
          
        
      
    
  );
}

export default AIImagePanel;