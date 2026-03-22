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
    
      {stats.map((stat) => (
        
          
            {stat.label}
          
          
            {stat.value}
          
          {stat.subLabel && (
            
              {stat.subLabel}
            
          )}
        
      ))}
    
  );
}