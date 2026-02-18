import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

export function QueueIntelligenceConfig({ qaParameters, onChange }: QueueIntelligenceConfigProps) {
  const normalizedQa = useMemo(() => (qaParameters && typeof qaParameters === "object" ? qaParameters : {}), [qaParameters]);
  const q = normalizedQa.queueIntelligence || normalizedQa.queue_intelligence || {};

  const [routingThreshold, setRoutingThreshold] = useState<number>(Number(q.routing_threshold ?? q.routingThreshold ?? 800));
  const [exactLines, setExactLines] = useState<string>(DEFAULT_EXACT);
  const [titleKeywordLines, setTitleKeywordLines] = useState<string>(DEFAULT_TITLE_KEYWORDS);
  const [industryKeywordLines, setIndustryKeywordLines] = useState<string>(DEFAULT_INDUSTRY_KEYWORDS);
  const [sizeLines, setSizeLines] = useState<string>(DEFAULT_SIZE_RANGES);

  const emitChange = (next: {
    routingThreshold?: number;
    exactLines?: string;
    titleKeywordLines?: string;
    industryKeywordLines?: string;
    sizeLines?: string;
  }) => {
    const resolvedThreshold = next.routingThreshold ?? routingThreshold;
    const resolvedExact = next.exactLines ?? exactLines;
    const resolvedTitle = next.titleKeywordLines ?? titleKeywordLines;
    const resolvedIndustry = next.industryKeywordLines ?? industryKeywordLines;
    const resolvedSize = next.sizeLines ?? sizeLines;

    const nextQa = {
      ...normalizedQa,
      queueIntelligence: {
        ...(normalizedQa.queueIntelligence || {}),
        prioritized_exact_titles: parseWeightedLines(resolvedExact),
        prioritized_title_keywords: parseWeightedLines(resolvedTitle),
        prioritized_industry_keywords: parseWeightedLines(resolvedIndustry),
        prioritized_employee_size_ranges: parseEmployeeLines(resolvedSize),
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

    setExactLines(exact.length > 0 ? weightedRulesToLines(exact) : DEFAULT_EXACT);
    setTitleKeywordLines(title.length > 0 ? weightedRulesToLines(title) : DEFAULT_TITLE_KEYWORDS);
    setIndustryKeywordLines(industry.length > 0 ? weightedRulesToLines(industry) : DEFAULT_INDUSTRY_KEYWORDS);
    setSizeLines(size.length > 0 ? employeeRulesToLines(size) : DEFAULT_SIZE_RANGES);
  }, [normalizedQa]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Intelligence Routing Rules</CardTitle>
        <CardDescription>
          Configure one score and one routing threshold. Format: one rule per line as <code>value|score</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
}
