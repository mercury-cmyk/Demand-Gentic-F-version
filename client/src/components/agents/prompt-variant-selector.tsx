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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

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
      <div className="space-y-2">
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (!variants || variants.length === 0) {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-3 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <span>No variants available. Create variants to test different approaches.</span>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Prompt Variant</label>
        <Select value={selectedVariantId || ""} onValueChange={(id) => {
          setSelectedVariantId(id);
          const variant = variants.find((v) => v.id === id);
          if (variant) onVariantChange?.(variant);
        }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select variant..." />
          </SelectTrigger>
          <SelectContent>
            {variants.map((variant) => (
              <SelectItem key={variant.id} value={variant.id}>
                <div className="flex items-center gap-2">
                  <span>{variant.variantName}</span>
                  {variant.isDefault && (
                    <Badge variant="secondary" className="text-xs">Default</Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Prompt Variant</label>
        <Select value={selectedVariantId || ""} onValueChange={(id) => {
          setSelectedVariantId(id);
          const variant = variants.find((v) => v.id === id);
          if (variant) onVariantChange?.(variant);
        }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select variant..." />
          </SelectTrigger>
          <SelectContent>
            {variants.map((variant) => (
              <SelectItem key={variant.id} value={variant.id}>
                <div className="flex items-center gap-2">
                  <span>{variant.variantName}</span>
                  <span className="text-xs text-gray-500">({variant.perspective})</span>
                  {variant.isDefault && (
                    <Badge variant="secondary" className="text-xs">Default</Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showPreview && selectedVariant && (
        <Card className="border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{selectedVariant.variantName}</CardTitle>
            <CardDescription className="text-xs">
              {selectedVariant.perspective}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="p-2 bg-gray-50 rounded border text-xs">
              <p className="italic">"{selectedVariant.firstMessage}"</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PromptVariantSelector;
