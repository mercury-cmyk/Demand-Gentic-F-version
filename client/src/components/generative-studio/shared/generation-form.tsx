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
import { Loader2, Sparkles, Brain } from "lucide-react";
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
}

export default function GenerationForm({
  contentType,
  brandKits = [],
  onGenerate,
  isGenerating,
  extraFields,
  generateLabel = "Generate",
  orgIntelligence,
}: GenerationFormProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState("");
  const [brandKitId, setBrandKitId] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [oiApplied, setOiApplied] = useState(false);

  // Auto-populate fields from Organization Intelligence on first load
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder={`Enter ${contentType} title...`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">Description / Prompt</Label>
        <Textarea
          id="prompt"
          placeholder={`Describe what you want to create. Be specific about the content, structure, and goals...`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="audience">Target Audience</Label>
          <Input
            id="audience"
            placeholder="e.g., B2B SaaS CTOs"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            placeholder="e.g., Technology, Healthcare"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger>
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

        <div className="space-y-2">
          <Label>Brand Kit</Label>
          <Select value={brandKitId} onValueChange={setBrandKitId}>
            <SelectTrigger>
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

      <div className="space-y-2">
        <Label htmlFor="context">Additional Context (optional)</Label>
        <Textarea
          id="context"
          placeholder="Any additional instructions, references, or context..."
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          rows={2}
        />
      </div>

      {orgIntelligence?.identity?.legalName?.value && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
          <Brain className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-700">
              Org Intelligence: {orgIntelligence.identity.legalName.value}
            </p>
            <p className="text-[10px] text-emerald-600">
              ICP, positioning, and brand context will be applied automatically
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 shrink-0">
            Active
          </Badge>
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isGenerating || !title || !prompt}
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
