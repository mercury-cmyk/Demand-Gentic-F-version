import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CampaignContext {
  campaignObjective?: string;
  productServiceInfo?: string;
  targetAudienceDescription?: string;
  successCriteria?: string;
  talkingPoints?: string[];
}

interface QueueIntelligenceConfigProps {
  qaParameters: any;
  onChange: (nextQaParameters: any) => void;
  campaignContext?: CampaignContext;
}

interface WeightedRule {
  value: string;
  score: number;
}

interface EmployeeSizeRule {
  label: string;
  min: number | null;
  max: number | null;
  score: number;
}



function normalizeWeightedRules(input: any): WeightedRule[] {
  if (!input) return [];
  if (!Array.isArray(input) && typeof input === "object") {
    return Object.entries(input)
      .map(([value, score]) => ({ value: String(value), score: Number(score) }))
      .filter((r) => !!r.value && Number.isFinite(r.score));
  }
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any): WeightedRule | null => {
      if (typeof item === "string") return { value: item, score: 100 };
      if (!item || typeof item !== "object") return null;
      const value = item.value ?? item.keyword ?? item.title ?? item.name;
      const score = item.score ?? item.weight ?? item.points ?? 100;
      if (!value) return null;
      return { value: String(value), score: Number(score) };
    })
    .filter((r): r is WeightedRule => !!r && Number.isFinite(r.score));
}

function normalizeEmployeeRules(input: any): EmployeeSizeRule[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any): EmployeeSizeRule | null => {
      if (typeof item === "string") {
        const parsed = parseRangeLabel(item);
        if (!parsed) return null;
        return { ...parsed, score: 0 };
      }
      if (!item || typeof item !== "object") return null;
      const label = String(item.label ?? item.range ?? `${item.min ?? ""}-${item.max ?? ""}`).trim();
      const score = Number(item.score ?? item.weight ?? item.points ?? 0);
      const parsed = parseRangeLabel(label) || {
        label,
        min: Number.isFinite(Number(item.min)) ? Number(item.min) : null,
        max: Number.isFinite(Number(item.max)) ? Number(item.max) : null,
      };
      if (!parsed.label || !Number.isFinite(score)) return null;
      return { ...parsed, score };
    })
    .filter((r): r is EmployeeSizeRule => !!r);
}

function parseRangeLabel(label: string): { label: string; min: number | null; max: number | null } | null {
  const trimmed = label.trim();
  const normalized = trimmed.replace(/employees?/gi, "").replace(/\s+/g, "").toLowerCase();
  const plusMatch = normalized.match(/^(\d+)\+$/);
  if (plusMatch) return { label: trimmed, min: Number(plusMatch[1]), max: null };
  const rangeMatch = normalized.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) return { label: trimmed, min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  return null;
}

function weightedRulesToLines(rules: WeightedRule[]): string {
  return rules.map((r) => `${r.value}|${r.score}`).join("\n");
}

function employeeRulesToLines(rules: EmployeeSizeRule[]): string {
  return rules
    .map((r) => {
      const range = r.max === null ? `${r.min ?? ""}+` : `${r.min ?? ""}-${r.max ?? ""}`;
      return `${range}|${r.score}`;
    })
    .join("\n");
}

function parseWeightedLines(raw: string): WeightedRule[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): WeightedRule | null => {
      const [valuePart, scorePart] = line.split("|").map((v) => v?.trim());
      if (!valuePart || !scorePart) return null;
      const score = Number(scorePart);
      if (!Number.isFinite(score)) return null;
      return { value: valuePart, score };
    })
    .filter((r): r is WeightedRule => !!r);
}

function parseEmployeeLines(raw: string): EmployeeSizeRule[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): EmployeeSizeRule | null => {
      const [rangePart, scorePart] = line.split("|").map((v) => v?.trim());
      if (!rangePart || !scorePart) return null;
      const score = Number(scorePart);
      if (!Number.isFinite(score)) return null;
      const parsed = parseRangeLabel(rangePart);
      if (parsed) return { ...parsed, score };
      return {
        label: rangePart,
        min: null,
        max: null,
        score,
      };
    })
    .filter((r): r is EmployeeSizeRule => !!r);
}

function normalizeKeywordList(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function keywordsToLines(keywords: string[]): string {
  return keywords.join("\n");
}

function parseKeywordLines(raw: string): string[] {
  return raw
    .split(/\n|,/) 
    .map((line) => line.trim())
    .filter(Boolean);
}

export function QueueIntelligenceConfig({ qaParameters, onChange, campaignContext }: QueueIntelligenceConfigProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const normalizedQa = useMemo(() => (qaParameters && typeof qaParameters === "object" ? qaParameters : {}), [qaParameters]);
  const q = normalizedQa.queueIntelligence || normalizedQa.queue_intelligence || {};

  const [routingThreshold, setRoutingThreshold] = useState(Number(q.routing_threshold ?? q.routingThreshold ?? 800));
  const [exactLines, setExactLines] = useState("");
  const [titleKeywordLines, setTitleKeywordLines] = useState("");
  const [industryKeywordLines, setIndustryKeywordLines] = useState("");
  const [sizeLines, setSizeLines] = useState("");
  const [problemKeywordLines, setProblemKeywordLines] = useState("");
  const [solutionKeywordLines, setSolutionKeywordLines] = useState("");
  const [titleWeight, setTitleWeight] = useState(1.0);
  const [industryWeight, setIndustryWeight] = useState(1.0);
  const [accountFitWeight, setAccountFitWeight] = useState(1.0);
  const [problemSolutionWeight, setProblemSolutionWeight] = useState(1.2);
  const [recentOutcomeWeight, setRecentOutcomeWeight] = useState(1.0);

  const emitChange = (next: {
    routingThreshold?: number;
    exactLines?: string;
    titleKeywordLines?: string;
    industryKeywordLines?: string;
    sizeLines?: string;
    problemKeywordLines?: string;
    solutionKeywordLines?: string;
    titleWeight?: number;
    industryWeight?: number;
    accountFitWeight?: number;
    problemSolutionWeight?: number;
    recentOutcomeWeight?: number;
  }) => {
    const resolvedThreshold = next.routingThreshold ?? routingThreshold;
    const resolvedExact = next.exactLines ?? exactLines;
    const resolvedTitle = next.titleKeywordLines ?? titleKeywordLines;
    const resolvedIndustry = next.industryKeywordLines ?? industryKeywordLines;
    const resolvedSize = next.sizeLines ?? sizeLines;
    const resolvedProblemKeywords = next.problemKeywordLines ?? problemKeywordLines;
    const resolvedSolutionKeywords = next.solutionKeywordLines ?? solutionKeywordLines;
    const resolvedTitleWeight = next.titleWeight ?? titleWeight;
    const resolvedIndustryWeight = next.industryWeight ?? industryWeight;
    const resolvedAccountFitWeight = next.accountFitWeight ?? accountFitWeight;
    const resolvedProblemSolutionWeight = next.problemSolutionWeight ?? problemSolutionWeight;
    const resolvedRecentOutcomeWeight = next.recentOutcomeWeight ?? recentOutcomeWeight;

    const nextQa = {
      ...normalizedQa,
      queueIntelligence: {
        ...(normalizedQa.queueIntelligence || {}),
        prioritized_exact_titles: parseWeightedLines(resolvedExact),
        prioritized_title_keywords: parseWeightedLines(resolvedTitle),
        prioritized_industry_keywords: parseWeightedLines(resolvedIndustry),
        prioritized_employee_size_ranges: parseEmployeeLines(resolvedSize),
        problem_keywords: parseKeywordLines(resolvedProblemKeywords),
        solution_keywords: parseKeywordLines(resolvedSolutionKeywords),
        title_weight: Number(resolvedTitleWeight),
        industry_weight: Number(resolvedIndustryWeight),
        account_fit_weight: Number(resolvedAccountFitWeight),
        problem_solution_weight: Number(resolvedProblemSolutionWeight),
        recent_outcome_weight: Number(resolvedRecentOutcomeWeight),
        routing_threshold: Number.isFinite(resolvedThreshold) ? resolvedThreshold : 800,
      },
    };
    onChange(nextQa);
  };

  useEffect(() => {
    const nextQ = normalizedQa.queueIntelligence || normalizedQa.queue_intelligence || {};
    setRoutingThreshold(Number(nextQ.routing_threshold ?? nextQ.routingThreshold ?? 800));

    const exact = normalizeWeightedRules(nextQ.prioritized_exact_titles ?? nextQ.prioritizedExactTitles);
    const title = normalizeWeightedRules(nextQ.prioritized_title_keywords ?? nextQ.prioritizedTitleKeywords);
    const industry = normalizeWeightedRules(nextQ.prioritized_industry_keywords ?? nextQ.prioritizedIndustryKeywords);
    const size = normalizeEmployeeRules(nextQ.prioritized_employee_size_ranges ?? nextQ.prioritizedEmployeeSizeRanges);
    const problems = normalizeKeywordList(nextQ.problem_keywords ?? nextQ.problemKeywords);
    const solutions = normalizeKeywordList(nextQ.solution_keywords ?? nextQ.solutionKeywords);

    setExactLines(exact.length > 0 ? weightedRulesToLines(exact) : "");
    setTitleKeywordLines(title.length > 0 ? weightedRulesToLines(title) : "");
    setIndustryKeywordLines(industry.length > 0 ? weightedRulesToLines(industry) : "");
    setSizeLines(size.length > 0 ? employeeRulesToLines(size) : "");
    setProblemKeywordLines(problems.length > 0 ? keywordsToLines(problems) : "");
    setSolutionKeywordLines(solutions.length > 0 ? keywordsToLines(solutions) : "");
    setTitleWeight(Number(nextQ.title_weight ?? nextQ.titleWeight ?? 1.0));
    setIndustryWeight(Number(nextQ.industry_weight ?? nextQ.industryWeight ?? 1.0));
    setAccountFitWeight(Number(nextQ.account_fit_weight ?? nextQ.accountFitWeight ?? 1.0));
    setProblemSolutionWeight(Number(nextQ.problem_solution_weight ?? nextQ.problemSolutionWeight ?? 1.2));
    setRecentOutcomeWeight(Number(nextQ.recent_outcome_weight ?? nextQ.recentOutcomeWeight ?? 1.0));
  }, [normalizedQa]);

  const generateFromCampaignContext = async () => {
    const hasContext =
      campaignContext?.campaignObjective ||
      campaignContext?.productServiceInfo ||
      campaignContext?.targetAudienceDescription ||
      campaignContext?.successCriteria ||
      (campaignContext?.talkingPoints?.length ?? 0) > 0;

    if (!hasContext) {
      toast({
        title: "No campaign context",
        description: "Add campaign context in the Messaging step first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/queue-intelligence/generate-config", campaignContext, { timeout: 90_000 });
      const data = await res.json();
      const c = data.config;

      setExactLines(c.exact ?? exactLines);
      setTitleKeywordLines(c.titleKeywords ?? titleKeywordLines);
      setIndustryKeywordLines(c.industryKeywords ?? industryKeywordLines);
      setProblemKeywordLines(c.problemKeywords ?? problemKeywordLines);
      setSolutionKeywordLines(c.solutionKeywords ?? solutionKeywordLines);
      setTitleWeight(c.titleWeight ?? titleWeight);
      setIndustryWeight(c.industryWeight ?? industryWeight);
      setAccountFitWeight(c.accountFitWeight ?? accountFitWeight);
      setProblemSolutionWeight(c.problemSolutionWeight ?? problemSolutionWeight);
      setRecentOutcomeWeight(c.recentOutcomeWeight ?? recentOutcomeWeight);
      setRoutingThreshold(c.routingThreshold ?? routingThreshold);

      emitChange({
        exactLines: c.exact ?? exactLines,
        titleKeywordLines: c.titleKeywords ?? titleKeywordLines,
        industryKeywordLines: c.industryKeywords ?? industryKeywordLines,
        problemKeywordLines: c.problemKeywords ?? problemKeywordLines,
        solutionKeywordLines: c.solutionKeywords ?? solutionKeywordLines,
        titleWeight: c.titleWeight ?? titleWeight,
        industryWeight: c.industryWeight ?? industryWeight,
        accountFitWeight: c.accountFitWeight ?? accountFitWeight,
        problemSolutionWeight: c.problemSolutionWeight ?? problemSolutionWeight,
        recentOutcomeWeight: c.recentOutcomeWeight ?? recentOutcomeWeight,
        routingThreshold: c.routingThreshold ?? routingThreshold,
      });

      toast({ title: "Routing rules generated", description: "AI has configured queue intelligence based on your campaign context." });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message || "Could not generate config.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    
      
        Queue Intelligence Routing Rules
        
          Configure one score and one routing threshold. Format: one rule per line as value|score.
        
      
      
        
          
            {isGenerating ? (
              
            ) : (
              
            )}
            {isGenerating ? "Generating..." : "AI Generate from Campaign Context"}
          
        

        
          Routing Threshold (Human if score &gt;= threshold)
           {
              const value = parseInt(e.target.value || "800", 10);
              setRoutingThreshold(value);
              emitChange({ routingThreshold: value });
            }}
            data-testid="input-routing-threshold"
          />
        

        
          Prioritized Exact Titles
           {
              const value = e.target.value;
              setExactLines(value);
              emitChange({ exactLines: value });
            }}
            rows={5}
            placeholder="Contact Center Manager|380"
            data-testid="textarea-exact-title-rules"
          />
        

        
          Prioritized Title Keywords
           {
              const value = e.target.value;
              setTitleKeywordLines(value);
              emitChange({ titleKeywordLines: value });
            }}
            rows={5}
            placeholder="customer service|180"
            data-testid="textarea-title-keyword-rules"
          />
        

        
          Prioritized Industry Keywords
           {
              const value = e.target.value;
              setIndustryKeywordLines(value);
              emitChange({ industryKeywordLines: value });
            }}
            rows={4}
            placeholder="BPO|120"
            data-testid="textarea-industry-keyword-rules"
          />
        

        
          Prioritized Employee Size Ranges
           {
              const value = e.target.value;
              setSizeLines(value);
              emitChange({ sizeLines: value });
            }}
            rows={4}
            placeholder={"200-2000|120\n50-199|70\n1-49|-40"}
            data-testid="textarea-employee-size-rules"
          />
          
            Range format supports min-max|score or min+|score.
          
        

        
          Problem Keywords (one per line)
           {
              const value = e.target.value;
              setProblemKeywordLines(value);
              emitChange({ problemKeywordLines: value });
            }}
            rows={5}
            placeholder="high call volume"
            data-testid="textarea-problem-keyword-rules"
          />
        

        
          Solution Keywords (one per line)
           {
              const value = e.target.value;
              setSolutionKeywordLines(value);
              emitChange({ solutionKeywordLines: value });
            }}
            rows={5}
            placeholder="contact center optimization"
            data-testid="textarea-solution-keyword-rules"
          />
        

        
          
            Title Weight
             {
                const value = Number(e.target.value || "1");
                setTitleWeight(value);
                emitChange({ titleWeight: value });
              }}
              data-testid="input-title-weight"
            />
          

          
            Industry Weight
             {
                const value = Number(e.target.value || "1");
                setIndustryWeight(value);
                emitChange({ industryWeight: value });
              }}
              data-testid="input-industry-weight"
            />
          

          
            Account Fit Weight
             {
                const value = Number(e.target.value || "1");
                setAccountFitWeight(value);
                emitChange({ accountFitWeight: value });
              }}
              data-testid="input-account-fit-weight"
            />
          

          
            Problem/Solution Weight
             {
                const value = Number(e.target.value || "1.2");
                setProblemSolutionWeight(value);
                emitChange({ problemSolutionWeight: value });
              }}
              data-testid="input-problem-solution-weight"
            />
          

          
            Recent Outcome Weight
             {
                const value = Number(e.target.value || "1");
                setRecentOutcomeWeight(value);
                emitChange({ recentOutcomeWeight: value });
              }}
              data-testid="input-recent-outcome-weight"
            />
          
        
      
    
  );
}