import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Monitor, DollarSign, Users, Megaphone, Settings, TrendingUp,
  Scale, ChevronDown, AlertTriangle, Target, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== Types ====================

export interface DepartmentMapping {
  department: string;
  confidence: number;
  recommendedApproach: string;
  messagingAngle: string;
  painPoints: string[];
  priorities: string[];
  commonObjections: string[];
  problems: Array<{ problemId: number; problemStatement: string; confidence: number }>;
  solutions: Array<{ serviceId: number; serviceName: string }>;
  problemCount: number;
  solutionCount: number;
}

interface DepartmentResultsViewProps {
  departments: DepartmentMapping[];
  primaryDepartment: string | null;
  crossDepartmentAngles?: string[];
}

// ==================== Constants ====================

const DEPT_ICONS: Record<string, typeof Monitor> = {
  IT: Monitor,
  Finance: DollarSign,
  HR: Users,
  Marketing: Megaphone,
  Operations: Settings,
  Sales: TrendingUp,
  Legal: Scale,
};

const DEPT_COLORS: Record<string, string> = {
  IT: "border-blue-200 bg-blue-50/50",
  Finance: "border-emerald-200 bg-emerald-50/50",
  HR: "border-purple-200 bg-purple-50/50",
  Marketing: "border-orange-200 bg-orange-50/50",
  Operations: "border-slate-200 bg-slate-50/50",
  Sales: "border-cyan-200 bg-cyan-50/50",
  Legal: "border-amber-200 bg-amber-50/50",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-red-100 text-red-800 border-red-200",
};

function getConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

// ==================== Department Card ====================

function DepartmentCard({
  dept,
  isPrimary,
}: {
  dept: DepartmentMapping;
  isPrimary: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = DEPT_ICONS[dept.department] || Settings;
  const colorClass = DEPT_COLORS[dept.department] || "border-gray-200 bg-gray-50/50";
  const confLevel = getConfidenceLevel(dept.confidence);
  const hasData = dept.problemCount > 0 || dept.solutionCount > 0;

  return (
    <Card className={cn(
      "transition-all",
      colorClass,
      isPrimary && "ring-2 ring-primary/30 shadow-md",
      !hasData && "opacity-60",
    )}>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">{dept.department}</CardTitle>
          </div>
          {isPrimary && (
            <Badge variant="default" className="text-[10px] h-5">Primary</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[10px] h-5", CONFIDENCE_COLORS[confLevel])}>
            {Math.round(dept.confidence * 100)}%
          </Badge>
          <span className="text-xs text-muted-foreground">
            {dept.problemCount} problems / {dept.solutionCount} solutions
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {dept.messagingAngle && (
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            {dept.messagingAngle}
          </p>
        )}

        {hasData && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs justify-between px-2">
                Details
                <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {dept.problems.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                    Problems
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1 pl-4">
                    {dept.problems.slice(0, 3).map((p) => (
                      <li key={p.problemId} className="list-disc">
                        {p.problemStatement}
                        <Badge variant="outline" className="text-[9px] h-4 ml-1">
                          {Math.round(p.confidence * 100)}%
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dept.solutions.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <Target className="h-3 w-3 text-primary" />
                    Solutions
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1 pl-4">
                    {dept.solutions.slice(0, 3).map((s) => (
                      <li key={s.serviceId} className="list-disc">{s.serviceName}</li>
                    ))}
                  </ul>
                </div>
              )}

              {dept.painPoints.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Pain Points</p>
                  <div className="flex flex-wrap gap-1">
                    {dept.painPoints.slice(0, 4).map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] h-5 font-normal">
                        {typeof p === "string" ? p : (p as any)?.painPoint || JSON.stringify(p)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {dept.commonObjections.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Common Objections</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 pl-4">
                    {dept.commonObjections.slice(0, 2).map((o, i) => (
                      <li key={i} className="list-disc">{typeof o === "string" ? o : JSON.stringify(o)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-1">
                <Badge variant="secondary" className="text-[10px]">
                  Approach: {dept.recommendedApproach}
                </Badge>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Main Component ====================

export function DepartmentResultsView({
  departments,
  primaryDepartment,
  crossDepartmentAngles = [],
}: DepartmentResultsViewProps) {
  const activeDepts = departments.filter((d) => d.problemCount > 0 || d.solutionCount > 0);
  const inactiveDepts = departments.filter((d) => d.problemCount === 0 && d.solutionCount === 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          7-Department Problem-Solution Mapping
        </h3>
        <span className="text-xs text-muted-foreground">
          {activeDepts.length} active / {inactiveDepts.length} no data
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {departments.map((dept) => (
          <DepartmentCard
            key={dept.department}
            dept={dept}
            isPrimary={dept.department === primaryDepartment}
          />
        ))}
      </div>

      {crossDepartmentAngles.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Cross-Department Angles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1">
              {crossDepartmentAngles.map((angle, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary shrink-0">&#8226;</span>
                  <span>{angle}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
