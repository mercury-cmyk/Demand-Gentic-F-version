import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  AlertTriangle,
  Calendar,
  Brain,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ProductMatch =
  | {
      matched: true;
      eventId: string;
      eventTitle: string;
      community: string;
      eventType: string | null;
      startDateHuman: string | null;
      matchReason: string;
      matchConfidence: number;
      matchSource: string;
      ctaLink: string | null;
      learnBullets: string[] | null;
    }
  | {
      matched: false;
      reason: string;
    };

type ThreePillarContext = {
  orgIntelligence: {
    available: boolean;
    organizationName: string | null;
    description: string | null;
    offerings: any | null;
  };
  accountProblems: {
    available: boolean;
    problemHypothesis: string | null;
    recommendedAngle: string | null;
    confidence: number | null;
  };
  productMatch: ProductMatch;
};

interface IntelligenceFlowDiagramProps {
  accountId?: string | null;
  campaignId?: string | null;
  contactId?: string | null;
  variant?: "compact" | "full";
  className?: string;
}

function PillarCard({
  icon: Icon,
  title,
  status,
  children,
  color,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  status: "active" | "inactive" | "loading";
  children: React.ReactNode;
  color: string;
  compact?: boolean;
}) {
  const colorMap: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      icon: "text-blue-600 dark:text-blue-400",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      icon: "text-amber-600 dark:text-amber-400",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    },
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      icon: "text-emerald-600 dark:text-emerald-400",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
    purple: {
      bg: "bg-purple-50 dark:bg-purple-950/30",
      border: "border-purple-200 dark:border-purple-800",
      icon: "text-purple-600 dark:text-purple-400",
      badge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    },
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        colors.bg,
        colors.border,
        compact ? "min-w-[160px]" : "min-w-[200px]"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("rounded-full p-1.5", colors.bg)}>
          <Icon className={cn("h-4 w-4", colors.icon)} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {status === "active" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />
        ) : status === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin ml-auto" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
        )}
      </div>
      <div className={cn("text-sm", compact ? "line-clamp-2" : "")}>{children}</div>
    </div>
  );
}

function InfoMode({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex items-center gap-2 mb-1">
        <Brain className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-semibold">How Our AI Engages Your Prospects</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Every conversation is powered by three layers of intelligence that combine to create highly
        relevant, context-aware engagement for each prospect.
      </p>
      <div className={cn("flex items-center gap-2", compact ? "flex-wrap" : "")}>
        <PillarCard icon={Building2} title="Org Intelligence" status="active" color="blue" compact={compact}>
          <span className="text-muted-foreground text-xs">
            Your organization&apos;s mission, offerings, and value proposition
          </span>
        </PillarCard>

        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />

        <PillarCard icon={AlertTriangle} title="Account Problems" status="active" color="amber" compact={compact}>
          <span className="text-muted-foreground text-xs">
            AI-researched challenges facing each target account
          </span>
        </PillarCard>

        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />

        <PillarCard icon={Calendar} title="Product Match" status="active" color="emerald" compact={compact}>
          <span className="text-muted-foreground text-xs">
            Dynamically matched pinpoint killar content for them only
          </span>
        </PillarCard>
      </div>

      {!compact && (
        <div className="flex justify-center pt-2">
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-4 py-2 flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium">
              Killer Context = All 3 Pillars Active
            </span>
            <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xs">
              Per-Interaction
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

export function IntelligenceFlowDiagram({
  accountId,
  campaignId,
  contactId,
  variant = "compact",
  className,
}: IntelligenceFlowDiagramProps) {
  const compact = variant === "compact";

  const { data, isLoading } = useQuery<ThreePillarContext>({
    queryKey: ["/api/product-intelligence/three-pillars", accountId, campaignId, contactId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set("campaignId", campaignId);
      if (contactId) params.set("contactId", contactId);
      const qs = params.toString();

      const url = accountId
        ? `/api/product-intelligence/three-pillars/${accountId}${qs ? `?${qs}` : ""}`
        : `/api/product-intelligence/three-pillars${qs ? `?${qs}` : ""}`;

      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });

  // No account selected - show informational mode
  if (!accountId && !isLoading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className={cn(compact ? "p-4" : "p-6")}>
          <InfoMode compact={compact} />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading intelligence context...</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { orgIntelligence, accountProblems, productMatch } = data;

  const activePillars = [
    orgIntelligence.available,
    accountProblems.available,
    productMatch.matched,
  ].filter(Boolean).length;

  const confidenceLabel =
    activePillars === 3 ? "Killer Context" : activePillars === 2 ? "Strong Context" : activePillars === 1 ? "Basic Context" : "No Context";

  const confidenceColor =
    activePillars === 3 ? "success" : activePillars === 2 ? "warning" : activePillars === 1 ? "secondary" : "destructive";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className={cn(compact ? "p-4" : "p-6", "space-y-3")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold">3-Pillar Intelligence</span>
          </div>
          <Badge variant={confidenceColor as any} className="text-xs">
            {activePillars}/3 {confidenceLabel}
          </Badge>
        </div>

        <div className={cn("flex items-stretch gap-2", compact ? "flex-wrap" : "")}>
          {/* Pillar 1: Org Intelligence */}
          <PillarCard
            icon={Building2}
            title="Org Intelligence"
            status={orgIntelligence.available ? "active" : "inactive"}
            color="blue"
            compact={compact}
          >
            {orgIntelligence.available ? (
              <div>
                <p className="font-medium text-xs">{orgIntelligence.organizationName}</p>
                {!compact && orgIntelligence.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {orgIntelligence.description}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
          </PillarCard>

          <ArrowRight className="h-4 w-4 text-muted-foreground self-center shrink-0 hidden sm:block" />

          {/* Pillar 2: Account Problems */}
          <PillarCard
            icon={AlertTriangle}
            title="Account Problems"
            status={accountProblems.available ? "active" : "inactive"}
            color="amber"
            compact={compact}
          >
            {accountProblems.available ? (
              <div>
                <p className="text-xs">{accountProblems.problemHypothesis}</p>
                {!compact && accountProblems.confidence != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Confidence: {Math.round(accountProblems.confidence * 100)}%
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No intel yet</span>
            )}
          </PillarCard>

          <ArrowRight className="h-4 w-4 text-muted-foreground self-center shrink-0 hidden sm:block" />

          {/* Pillar 3: Product Match */}
          <PillarCard
            icon={Calendar}
            title="Product Match"
            status={productMatch.matched ? "active" : "inactive"}
            color="emerald"
            compact={compact}
          >
            {productMatch.matched ? (
              <div>
                <p className="font-medium text-xs">{productMatch.eventTitle}</p>
                {!compact && (
                  <>
                    {productMatch.startDateHuman && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {productMatch.startDateHuman}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Match: {productMatch.matchReason}
                    </p>
                    {productMatch.matchConfidence != null && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {Math.round(productMatch.matchConfidence * 100)}% confidence
                      </Badge>
                    )}
                  </>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {productMatch.reason || "No event match"}
              </span>
            )}
          </PillarCard>
        </div>

        {/* Killer Context Summary - full variant only */}
        {!compact && activePillars >= 2 && (
          <div className="flex justify-center pt-1">
            <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-4 py-2.5 flex items-center gap-3 max-w-lg">
              <Brain className="h-5 w-5 text-purple-500 shrink-0" />
              <div className="text-xs">
                <p className="font-medium">
                  {activePillars === 3
                    ? "All 3 pillars active — maximum context for every interaction"
                    : "2 of 3 pillars active — strong context, product match will enhance further"}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  AI agents dynamically combine these signals for each call, email, and touchpoint.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default IntelligenceFlowDiagram;
