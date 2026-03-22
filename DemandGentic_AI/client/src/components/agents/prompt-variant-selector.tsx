/**
 * Prompt Variant Selector
 * Compact component for selecting a variant during test calls or live campaigns
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2 } from "lucide-react";

interface PromptVariant {
  id: string;
  variantName: string;
  perspective: string;
  firstMessage?: string;
  isDefault: boolean;
}

interface PromptVariantSelectorProps {
  agentId: string;
  onVariantChange?: (variant: PromptVariant | null) => void;
  showPreview?: boolean;
  compact?: boolean;
}

export function PromptVariantSelector({
  agentId,
  onVariantChange,
  showPreview = true,
  compact = false,
}: PromptVariantSelectorProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(null);

  // Fetch available variants
  const { data: variants, isLoading } = useQuery({
    queryKey: [`/api/agents/${agentId}/variants`],
    queryFn: async () => {
      const result = await apiRequest("GET", `/api/agents/${agentId}/variants`);
      // apiRequest returns parsed JSON; guard against Response or other types
      const data = result instanceof Response ? await result.json() : result;
      return Array.isArray(data) ? (data as unknown as PromptVariant[]) : ([] as PromptVariant[]);
    },
  });

  // Set default variant on load
  useEffect(() => {
    if (variants && !selectedVariantId) {
      const defaultVariant = variants.find((v) => v.isDefault);
      if (defaultVariant) {
        setSelectedVariantId(defaultVariant.id);
        onVariantChange?.(defaultVariant);
      }
    }
  }, [variants, selectedVariantId, onVariantChange]);

  const selectedVariant = variants?.find((v) => v.id === selectedVariantId);

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (!variants || variants.length === 0) {
    return (
      
        
          
          No variants available. Create variants to test different approaches.
        
      
    );
  }

  if (compact) {
    return (
      
        Prompt Variant
         {
          setSelectedVariantId(id);
          const variant = variants.find((v) => v.id === id);
          if (variant) onVariantChange?.(variant);
        }}>
          
            
          
          
            {variants.map((variant) => (
              
                
                  {variant.variantName}
                  {variant.isDefault && (
                    Default
                  )}
                
              
            ))}
          
        
      
    );
  }

  return (
    
      
        Prompt Variant
         {
          setSelectedVariantId(id);
          const variant = variants.find((v) => v.id === id);
          if (variant) onVariantChange?.(variant);
        }}>
          
            
          
          
            {variants.map((variant) => (
              
                
                  {variant.variantName}
                  ({variant.perspective})
                  {variant.isDefault && (
                    Default
                  )}
                
              
            ))}
          
        
      

      {showPreview && selectedVariant && (
        
          
            {selectedVariant.variantName}
            
              {selectedVariant.perspective}
            
          
          
            
              "{selectedVariant.firstMessage}"
            
          
        
      )}
    
  );
}

export default PromptVariantSelector;