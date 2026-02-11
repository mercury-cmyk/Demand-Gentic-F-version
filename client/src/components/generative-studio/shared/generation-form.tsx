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
import { Loader2, Sparkles, Brain, AlertCircle } from "lucide-react";
import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

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
}: GenerationFormProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState("");
  const [brandKitId, setBrandKitId] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [oiApplied, setOiApplied] = useState(false);
  const isDisabled = !!disabled;

  useEffect(() => {
    setOiApplied(false);
  }, [orgIntelligence?.identity?.legalName?.value]);

  useEffect(() => {
    if (orgIntelligence && !oiApplied) {
      const personas = orgIntelligence.icp?.personas?.value;
      const industries = orgIntelligence.icp?.industries?.value;

      if (personas && !targetAudience) {
        setTargetAudience(typeof personas === "string" ? personas.split(",")[0]?.trim() || "" : "");
      }
      if (industries && !industry) {
        setIndustry(typeof industries === "string" ? industries.split(",")[0]?.trim() || "" : "");
      }
      setOiApplied(true);
    }
  }, [orgIntelligence]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({
      title,
      prompt,
      targetAudience: targetAudience || undefined,
      industry: industry || undefined,
      tone: tone || undefined,
      brandKitId: brandKitId || undefined,
      additionalContext: additionalContext || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isDisabled && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {disabledReason || "Select an organization to start generating content."}
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
          placeholder={`Describe what you want to create. Be specific about the content, structure, and goals...`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={isDisabled}
          required
          className="resize-none"
        />
      </div>

      {/* Targeting */}
      <div className="space-y-3 pt-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Targeting</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="audience" className="text-xs">Target Audience</Label>
            <Input
              id="audience"
              placeholder="e.g., B2B SaaS CTOs"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              disabled={isDisabled}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry" className="text-xs">Industry</Label>
            <Input
              id="industry"
              placeholder="e.g., Technology"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={isDisabled}
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Style & Brand */}
      <div className="space-y-3 pt-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Style & Brand</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tone</Label>
            <Select value={tone} onValueChange={setTone} disabled={isDisabled}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select tone..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="conversational">Conversational</SelectItem>
                <SelectItem value="insightful">Insightful</SelectItem>
                <SelectItem value="persuasive">Persuasive</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand Kit</Label>
            <Select value={brandKitId} onValueChange={setBrandKitId} disabled={isDisabled}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select kit..." />
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
      </div>

      {extraFields}

      <div className="space-y-1.5">
        <Label htmlFor="context" className="text-xs">Additional Context <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          id="context"
          placeholder="Any additional instructions, references, or context..."
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          rows={2}
          disabled={isDisabled}
          className="resize-none"
        />
      </div>

      {/* Org Intelligence indicator */}
      {orgIntelligence?.identity?.legalName?.value && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
          <Brain className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-700">
              {orgIntelligence.identity.legalName.value}
            </p>
            <p className="text-[10px] text-emerald-600">
              ICP, positioning & brand context applied
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 shrink-0">
            OI
          </Badge>
        </div>
      )}

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
