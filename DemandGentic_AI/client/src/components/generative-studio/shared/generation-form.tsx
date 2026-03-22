import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Brain, AlertCircle, ShieldCheck, Palette, Target, MessageSquareText } from "lucide-react";
import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

function getOiValue(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.value || "";
}

interface BrandKit {
  id: string;
  name: string;
  companyName?: string;
}

interface GenerationFormProps {
  contentType: string;
  brandKits?: BrandKit[];
  onGenerate: (params: Record) => void;
  isGenerating: boolean;
  extraFields?: React.ReactNode;
  generateLabel?: string;
  orgIntelligence?: OrgIntelligenceProfile | null;
  disabled?: boolean;
  disabledReason?: string;
  initialValues?: {
    title?: string;
    prompt?: string;
    brandKitId?: string;
    additionalContext?: string;
  };
  initialValuesKey?: string;
}

export default function GenerationForm({
  contentType,
  brandKits = [],
  onGenerate,
  isGenerating,
  extraFields,
  generateLabel = "Generate",
  orgIntelligence,
  disabled,
  disabledReason,
  initialValues,
  initialValuesKey,
}: GenerationFormProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [brandKitId, setBrandKitId] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const hasOrgIntel = !!getOiValue(orgIntelligence?.identity?.legalName);
  // OI is mandatory — disable form if not available
  const isDisabled = !!disabled || !hasOrgIntel;

  // Derived OI context (read-only — single source of truth)
  const oiPersonas = getOiValue(orgIntelligence?.icp?.personas);
  const oiIndustries = getOiValue(orgIntelligence?.icp?.industries);
  const oiTone = getOiValue(orgIntelligence?.branding?.tone);
  const oiPositioning = getOiValue(orgIntelligence?.positioning?.oneLiner);
  const oiKeywords = getOiValue(orgIntelligence?.branding?.keywords);
  const oiForbiddenTerms = getOiValue(orgIntelligence?.branding?.forbiddenTerms);
  const oiCommunicationStyle = getOiValue(orgIntelligence?.branding?.communicationStyle);
  const oiPrimaryColor = getOiValue(orgIntelligence?.branding?.primaryColor);
  const oiSecondaryColor = getOiValue(orgIntelligence?.branding?.secondaryColor);

  useEffect(() => {
    if (!initialValues) return;

    setTitle((prev) => (prev?.trim()?.length ? prev : initialValues.title || ""));
    setPrompt((prev) => (prev?.trim()?.length ? prev : initialValues.prompt || ""));
    setBrandKitId((prev) => (prev?.trim()?.length ? prev : initialValues.brandKitId || ""));
    setAdditionalContext((prev) => (prev?.trim()?.length ? prev : initialValues.additionalContext || ""));
  }, [initialValues, initialValuesKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasOrgIntel) return;
    onGenerate({
      title,
      prompt,
      brandKitId: brandKitId || undefined,
      additionalContext: additionalContext || undefined,
    });
  };

  return (
    
      {/* Mandatory OI Gate */}
      {!hasOrgIntel && (
        
          
          
            Organizational Intelligence Required
            
              {disabled && disabledReason
                ? disabledReason
                : "Select an organization with a completed intelligence profile to generate content. All outputs must be derived from Organizational Intelligence."}
            
          
        
      )}

      {/* OI Context Panel — shows derived targeting/tone/positioning from single source of truth */}
      {hasOrgIntel && (
        
          
            
            
              {getOiValue(orgIntelligence?.identity?.legalName)} — Intelligence Active
            
            
              Single Source of Truth
            
          
          
            {oiPersonas && (
              
                
                
                  Audience
                  {oiPersonas}
                
              
            )}
            {oiIndustries && (
              
                
                
                  Industry
                  {oiIndustries}
                
              
            )}
            {oiTone && (
              
                
                
                  Tone
                  {oiTone}
                
              
            )}
            {oiPositioning && (
              
                
                
                  Positioning
                  {oiPositioning}
                
              
            )}
          
          {oiKeywords && (
            
              Brand Keywords: {oiKeywords}
            
          )}
          {/* Brand Colors & Style */}
          {(oiPrimaryColor || oiSecondaryColor || oiCommunicationStyle) && (
            
              {oiPrimaryColor && (
                
                  
                  Primary: {oiPrimaryColor}
                
              )}
              {oiSecondaryColor && (
                
                  
                  Secondary: {oiSecondaryColor}
                
              )}
              {oiCommunicationStyle && (
                Style: {oiCommunicationStyle}
              )}
            
          )}
          {oiForbiddenTerms && (
            
              ⚠ Forbidden Terms: {oiForbiddenTerms}
            
          )}
        
      )}

      {/* Core Fields */}
      
        Title
         setTitle(e.target.value)}
          disabled={isDisabled}
          required
          className="h-9"
        />
      

      
        Description / Prompt
         setPrompt(e.target.value)}
          rows={4}
          disabled={isDisabled}
          required
          className="resize-none"
        />
      

      {/* Brand Kit (optional — supplements OI visual identity) */}
      
        Brand Kit (optional — supplements OI)
        
          
            
              
            
            
              {brandKits.map((kit) => (
                
                  {kit.name || kit.companyName || kit.id}
                
              ))}
              {brandKits.length === 0 && (
                No brand kits available
              )}
            
          
        
      

      {extraFields}

      
        Additional Context (optional)
         setAdditionalContext(e.target.value)}
          rows={2}
          disabled={isDisabled}
          className="resize-none"
        />
      

      
        {isGenerating ? (
          <>
            
            Generating...
          
        ) : (
          <>
            
            {generateLabel}
          
        )}
      
    
  );
}