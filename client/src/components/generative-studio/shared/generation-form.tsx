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
  onGenerate: (params: Record<string, any>) => void;
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Mandatory OI Gate */}
      {!hasOrgIntel && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <div>
            <p className="font-medium">Organizational Intelligence Required</p>
            <p className="mt-0.5">
              {disabled && disabledReason
                ? disabledReason
                : "Select an organization with a completed intelligence profile to generate content. All outputs must be derived from Organizational Intelligence."}
            </p>
          </div>
        </div>
      )}

      {/* OI Context Panel — shows derived targeting/tone/positioning from single source of truth */}
      {hasOrgIntel && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs font-semibold text-emerald-700">
              {getOiValue(orgIntelligence?.identity?.legalName)} — Intelligence Active
            </p>
            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 ml-auto shrink-0">
              Single Source of Truth
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {oiPersonas && (
              <div className="flex items-start gap-1.5">
                <Target className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Audience</p>
                  <p className="text-[11px] text-emerald-700 leading-tight">{oiPersonas}</p>
                </div>
              </div>
            )}
            {oiIndustries && (
              <div className="flex items-start gap-1.5">
                <Target className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Industry</p>
                  <p className="text-[11px] text-emerald-700 leading-tight">{oiIndustries}</p>
                </div>
              </div>
            )}
            {oiTone && (
              <div className="flex items-start gap-1.5">
                <MessageSquareText className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Tone</p>
                  <p className="text-[11px] text-emerald-700 leading-tight capitalize">{oiTone}</p>
                </div>
              </div>
            )}
            {oiPositioning && (
              <div className="flex items-start gap-1.5">
                <Palette className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Positioning</p>
                  <p className="text-[11px] text-emerald-700 leading-tight line-clamp-2">{oiPositioning}</p>
                </div>
              </div>
            )}
          </div>
          {oiKeywords && (
            <p className="text-[10px] text-emerald-600 border-t border-emerald-200 pt-1.5 mt-1">
              <span className="font-medium">Brand Keywords:</span> {oiKeywords}
            </p>
          )}
          {/* Brand Colors & Style */}
          {(oiPrimaryColor || oiSecondaryColor || oiCommunicationStyle) && (
            <div className="flex flex-wrap items-center gap-3 border-t border-emerald-200 pt-1.5 mt-1">
              {oiPrimaryColor && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-emerald-300 shrink-0" style={{ backgroundColor: oiPrimaryColor }} />
                  <span className="text-[10px] text-emerald-600"><span className="font-medium">Primary:</span> {oiPrimaryColor}</span>
                </div>
              )}
              {oiSecondaryColor && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-emerald-300 shrink-0" style={{ backgroundColor: oiSecondaryColor }} />
                  <span className="text-[10px] text-emerald-600"><span className="font-medium">Secondary:</span> {oiSecondaryColor}</span>
                </div>
              )}
              {oiCommunicationStyle && (
                <span className="text-[10px] text-emerald-600"><span className="font-medium">Style:</span> {oiCommunicationStyle}</span>
              )}
            </div>
          )}
          {oiForbiddenTerms && (
            <p className="text-[10px] text-red-500 border-t border-emerald-200 pt-1.5 mt-1">
              <span className="font-medium">⚠ Forbidden Terms:</span> {oiForbiddenTerms}
            </p>
          )}
        </div>
      )}

      {/* Core Fields */}
      <div className="space-y-1.5">
        <Label htmlFor="title" className="text-xs font-medium">Title</Label>
        <Input
          id="title"
          placeholder={`Enter ${contentType} title...`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isDisabled}
          required
          className="h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prompt" className="text-xs font-medium">Description / Prompt</Label>
        <Textarea
          id="prompt"
          placeholder={`Describe what you want to create. Be specific about the content, structure, and goals. Targeting, tone, and positioning are automatically sourced from Organizational Intelligence.`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={isDisabled}
          required
          className="resize-none"
        />
      </div>

      {/* Brand Kit (optional — supplements OI visual identity) */}
      <div className="space-y-3 pt-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Brand Kit <span className="font-normal normal-case">(optional — supplements OI)</span></p>
        <div className="space-y-1.5">
          <Select value={brandKitId} onValueChange={setBrandKitId} disabled={isDisabled}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select brand kit..." />
            </SelectTrigger>
            <SelectContent>
              {brandKits.map((kit) => (
                <SelectItem key={kit.id} value={kit.id}>
                  {kit.name || kit.companyName || kit.id}
                </SelectItem>
              ))}
              {brandKits.length === 0 && (
                <SelectItem value="none" disabled>No brand kits available</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {extraFields}

      <div className="space-y-1.5">
        <Label htmlFor="context" className="text-xs">Additional Context <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          id="context"
          placeholder="Any additional instructions, references, or context (do not repeat OI data — it is automatically injected)..."
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          rows={2}
          disabled={isDisabled}
          className="resize-none"
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-sm"
        disabled={isGenerating || !title || !prompt || isDisabled}
        size="lg"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            {generateLabel}
          </>
        )}
      </Button>
    </form>
  );
}
