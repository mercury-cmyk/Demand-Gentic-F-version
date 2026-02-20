import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface QueueIntelligenceConfigProps {
  qaParameters: any;
  onChange: (nextQaParameters: any) => void;
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

const DEFAULT_EXACT = "Contact Center Manager|380\nContact Center Director|420";
const DEFAULT_TITLE_KEYWORDS = "contact center|220\ncustomer service|180\ncall center|170";
const DEFAULT_INDUSTRY_KEYWORDS = "BPO|120\nTelecommunications|90";
const DEFAULT_SIZE_RANGES = "200-2000|120\n50-199|70\n1-49|-40";
const DEFAULT_PROBLEM_KEYWORDS = "high call volume\nlong hold times\nabandonment\ncustomer churn\nnetwork downtime\npacket loss\npoor call quality\nservice latency";
const DEFAULT_SOLUTION_KEYWORDS = "contact center optimization\nccaas\nworkforce management\nsip trunking\nvoip\nnetwork monitoring\nnoc automation\ntelecom optimization";

const TRADITIONAL_TELECOM_PRESET = {
  exact: "Head of Contact Center|320\nDirector of Customer Service|310\nCustomer Service Director|300\nContact Center Manager|290\nNetwork Operations Manager|300\nNOC Manager|290\nTelecom Manager|300\nVoice Engineer|270\nUnified Communications Manager|280",
  titleKeywords: "contact center|240\ncustomer service|230\ncall center|220\nnetwork|210\ntelecom|220\nnoc|210\nvoice|180\nsip|170\nvoip|170\ncarrier|180",
  industryKeywords: "manufacturing|220\nlogistics|210\nutilities|200\nconstruction|180\nautomotive|170\ntelecommunications|260\ntelecom|260\ncarrier|240",
  problemKeywords: "high call volume\nlong hold times\nabandonment\nsla breach\nnetwork downtime\npacket loss\ncall quality\nservice latency\ncustomer churn",
  solutionKeywords: "ccaas\ncontact center optimization\nworkforce management\nsip trunking\nvoip\nnetwork monitoring\nnoc automation\nquality of service\ntelecom optimization",
  titleWeight: 1.35,
  industryWeight: 1.2,
  accountFitWeight: 0.9,
  problemSolutionWeight: 1.3,
  recentOutcomeWeight: 1.0,
  routingThreshold: 820,
};

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

export function QueueIntelligenceConfig({ qaParameters, onChange }: QueueIntelligenceConfigProps) {
  const normalizedQa = useMemo(() => (qaParameters && typeof qaParameters === "object" ? qaParameters : {}), [qaParameters]);
  const q = normalizedQa.queueIntelligence || normalizedQa.queue_intelligence || {};

  const [routingThreshold, setRoutingThreshold] = useState<number>(Number(q.routing_threshold ?? q.routingThreshold ?? 800));
  const [exactLines, setExactLines] = useState<string>(DEFAULT_EXACT);
  const [titleKeywordLines, setTitleKeywordLines] = useState<string>(DEFAULT_TITLE_KEYWORDS);
  const [industryKeywordLines, setIndustryKeywordLines] = useState<string>(DEFAULT_INDUSTRY_KEYWORDS);
  const [sizeLines, setSizeLines] = useState<string>(DEFAULT_SIZE_RANGES);
  const [problemKeywordLines, setProblemKeywordLines] = useState<string>(DEFAULT_PROBLEM_KEYWORDS);
  const [solutionKeywordLines, setSolutionKeywordLines] = useState<string>(DEFAULT_SOLUTION_KEYWORDS);
  const [titleWeight, setTitleWeight] = useState<number>(1.0);
  const [industryWeight, setIndustryWeight] = useState<number>(1.0);
  const [accountFitWeight, setAccountFitWeight] = useState<number>(1.0);
  const [problemSolutionWeight, setProblemSolutionWeight] = useState<number>(1.2);
  const [recentOutcomeWeight, setRecentOutcomeWeight] = useState<number>(1.0);

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

    setExactLines(exact.length > 0 ? weightedRulesToLines(exact) : DEFAULT_EXACT);
    setTitleKeywordLines(title.length > 0 ? weightedRulesToLines(title) : DEFAULT_TITLE_KEYWORDS);
    setIndustryKeywordLines(industry.length > 0 ? weightedRulesToLines(industry) : DEFAULT_INDUSTRY_KEYWORDS);
    setSizeLines(size.length > 0 ? employeeRulesToLines(size) : DEFAULT_SIZE_RANGES);
    setProblemKeywordLines(problems.length > 0 ? keywordsToLines(problems) : DEFAULT_PROBLEM_KEYWORDS);
    setSolutionKeywordLines(solutions.length > 0 ? keywordsToLines(solutions) : DEFAULT_SOLUTION_KEYWORDS);
    setTitleWeight(Number(nextQ.title_weight ?? nextQ.titleWeight ?? 1.0));
    setIndustryWeight(Number(nextQ.industry_weight ?? nextQ.industryWeight ?? 1.0));
    setAccountFitWeight(Number(nextQ.account_fit_weight ?? nextQ.accountFitWeight ?? 1.0));
    setProblemSolutionWeight(Number(nextQ.problem_solution_weight ?? nextQ.problemSolutionWeight ?? 1.2));
    setRecentOutcomeWeight(Number(nextQ.recent_outcome_weight ?? nextQ.recentOutcomeWeight ?? 1.0));
  }, [normalizedQa]);

  const applyTraditionalTelecomPreset = () => {
    setExactLines(TRADITIONAL_TELECOM_PRESET.exact);
    setTitleKeywordLines(TRADITIONAL_TELECOM_PRESET.titleKeywords);
    setIndustryKeywordLines(TRADITIONAL_TELECOM_PRESET.industryKeywords);
    setProblemKeywordLines(TRADITIONAL_TELECOM_PRESET.problemKeywords);
    setSolutionKeywordLines(TRADITIONAL_TELECOM_PRESET.solutionKeywords);
    setTitleWeight(TRADITIONAL_TELECOM_PRESET.titleWeight);
    setIndustryWeight(TRADITIONAL_TELECOM_PRESET.industryWeight);
    setAccountFitWeight(TRADITIONAL_TELECOM_PRESET.accountFitWeight);
    setProblemSolutionWeight(TRADITIONAL_TELECOM_PRESET.problemSolutionWeight);
    setRecentOutcomeWeight(TRADITIONAL_TELECOM_PRESET.recentOutcomeWeight);
    setRoutingThreshold(TRADITIONAL_TELECOM_PRESET.routingThreshold);

    emitChange({
      exactLines: TRADITIONAL_TELECOM_PRESET.exact,
      titleKeywordLines: TRADITIONAL_TELECOM_PRESET.titleKeywords,
      industryKeywordLines: TRADITIONAL_TELECOM_PRESET.industryKeywords,
      problemKeywordLines: TRADITIONAL_TELECOM_PRESET.problemKeywords,
      solutionKeywordLines: TRADITIONAL_TELECOM_PRESET.solutionKeywords,
      titleWeight: TRADITIONAL_TELECOM_PRESET.titleWeight,
      industryWeight: TRADITIONAL_TELECOM_PRESET.industryWeight,
      accountFitWeight: TRADITIONAL_TELECOM_PRESET.accountFitWeight,
      problemSolutionWeight: TRADITIONAL_TELECOM_PRESET.problemSolutionWeight,
      recentOutcomeWeight: TRADITIONAL_TELECOM_PRESET.recentOutcomeWeight,
      routingThreshold: TRADITIONAL_TELECOM_PRESET.routingThreshold,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Intelligence Routing Rules</CardTitle>
        <CardDescription>
          Configure one score and one routing threshold. Format: one rule per line as <code>value|score</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={applyTraditionalTelecomPreset} data-testid="button-apply-traditional-telecom-preset">
            Apply Traditional + Contact Center + Telecom Preset
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="routing-threshold">Routing Threshold (Human if score &gt;= threshold)</Label>
          <Input
            id="routing-threshold"
            type="number"
            min={0}
            step={10}
            value={routingThreshold}
            onChange={(e) => {
              const value = parseInt(e.target.value || "800", 10);
              setRoutingThreshold(value);
              emitChange({ routingThreshold: value });
            }}
            data-testid="input-routing-threshold"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exact-title-rules">Prioritized Exact Titles</Label>
          <Textarea
            id="exact-title-rules"
            value={exactLines}
            onChange={(e) => {
              const value = e.target.value;
              setExactLines(value);
              emitChange({ exactLines: value });
            }}
            rows={5}
            placeholder="Contact Center Manager|380"
            data-testid="textarea-exact-title-rules"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title-keyword-rules">Prioritized Title Keywords</Label>
          <Textarea
            id="title-keyword-rules"
            value={titleKeywordLines}
            onChange={(e) => {
              const value = e.target.value;
              setTitleKeywordLines(value);
              emitChange({ titleKeywordLines: value });
            }}
            rows={5}
            placeholder="customer service|180"
            data-testid="textarea-title-keyword-rules"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry-keyword-rules">Prioritized Industry Keywords</Label>
          <Textarea
            id="industry-keyword-rules"
            value={industryKeywordLines}
            onChange={(e) => {
              const value = e.target.value;
              setIndustryKeywordLines(value);
              emitChange({ industryKeywordLines: value });
            }}
            rows={4}
            placeholder="BPO|120"
            data-testid="textarea-industry-keyword-rules"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="employee-size-rules">Prioritized Employee Size Ranges</Label>
          <Textarea
            id="employee-size-rules"
            value={sizeLines}
            onChange={(e) => {
              const value = e.target.value;
              setSizeLines(value);
              emitChange({ sizeLines: value });
            }}
            rows={4}
            placeholder={"200-2000|120\n50-199|70\n1-49|-40"}
            data-testid="textarea-employee-size-rules"
          />
          <p className="text-sm text-muted-foreground">
            Range format supports <code>min-max|score</code> or <code>min+|score</code>.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="problem-keyword-rules">Problem Keywords (one per line)</Label>
          <Textarea
            id="problem-keyword-rules"
            value={problemKeywordLines}
            onChange={(e) => {
              const value = e.target.value;
              setProblemKeywordLines(value);
              emitChange({ problemKeywordLines: value });
            }}
            rows={5}
            placeholder="high call volume"
            data-testid="textarea-problem-keyword-rules"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="solution-keyword-rules">Solution Keywords (one per line)</Label>
          <Textarea
            id="solution-keyword-rules"
            value={solutionKeywordLines}
            onChange={(e) => {
              const value = e.target.value;
              setSolutionKeywordLines(value);
              emitChange({ solutionKeywordLines: value });
            }}
            rows={5}
            placeholder="contact center optimization"
            data-testid="textarea-solution-keyword-rules"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title-weight">Title Weight</Label>
            <Input
              id="title-weight"
              type="number"
              step="0.05"
              min="0"
              value={titleWeight}
              onChange={(e) => {
                const value = Number(e.target.value || "1");
                setTitleWeight(value);
                emitChange({ titleWeight: value });
              }}
              data-testid="input-title-weight"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry-weight">Industry Weight</Label>
            <Input
              id="industry-weight"
              type="number"
              step="0.05"
              min="0"
              value={industryWeight}
              onChange={(e) => {
                const value = Number(e.target.value || "1");
                setIndustryWeight(value);
                emitChange({ industryWeight: value });
              }}
              data-testid="input-industry-weight"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-fit-weight">Account Fit Weight</Label>
            <Input
              id="account-fit-weight"
              type="number"
              step="0.05"
              min="0"
              value={accountFitWeight}
              onChange={(e) => {
                const value = Number(e.target.value || "1");
                setAccountFitWeight(value);
                emitChange({ accountFitWeight: value });
              }}
              data-testid="input-account-fit-weight"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="problem-solution-weight">Problem/Solution Weight</Label>
            <Input
              id="problem-solution-weight"
              type="number"
              step="0.05"
              min="0"
              value={problemSolutionWeight}
              onChange={(e) => {
                const value = Number(e.target.value || "1.2");
                setProblemSolutionWeight(value);
                emitChange({ problemSolutionWeight: value });
              }}
              data-testid="input-problem-solution-weight"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recent-outcome-weight">Recent Outcome Weight</Label>
            <Input
              id="recent-outcome-weight"
              type="number"
              step="0.05"
              min="0"
              value={recentOutcomeWeight}
              onChange={(e) => {
                const value = Number(e.target.value || "1");
                setRecentOutcomeWeight(value);
                emitChange({ recentOutcomeWeight: value });
              }}
              data-testid="input-recent-outcome-weight"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
