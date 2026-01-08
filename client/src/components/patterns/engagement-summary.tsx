import { cn } from "@/lib/utils";

export interface EngagementSummaryStat {
  label: string;
  value: number | string;
  subLabel?: string;
}

export interface EngagementSummaryProps {
  stats: EngagementSummaryStat[];
  className?: string;
}

export function EngagementSummary({ stats, className }: EngagementSummaryProps) {
  if (!stats.length) {
    return null;
  }

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)} data-testid="engagement-summary">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border bg-card p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </div>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {stat.value}
          </div>
          {stat.subLabel && (
            <div className="mt-1 text-xs text-muted-foreground">
              {stat.subLabel}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
