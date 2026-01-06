/**
 * ResultCount Component
 * 
 * Displays the number of results after applying filters
 * Shows "Showing X Results" prominently at the top of results sections
 */

import { cn } from "@/lib/utils";

interface ResultCountProps {
  count: number;
  isLoading?: boolean;
  className?: string;
  showTotal?: boolean;
  total?: number;
}

export function ResultCount({ 
  count, 
  isLoading = false, 
  className,
  showTotal = false,
  total 
}: ResultCountProps) {
  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)} data-testid="result-count-loading">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span>Loading results...</span>
      </div>
    );
  }

  const displayText = showTotal && total !== undefined
    ? `Showing ${count} of ${total} Results`
    : `Showing ${count.toLocaleString()} ${count === 1 ? 'Result' : 'Results'}`;

  return (
    <div 
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        count === 0 ? "text-muted-foreground" : "text-foreground",
        className
      )}
      data-testid="result-count"
    >
      <span>{displayText}</span>
      {count > 0 && (
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </div>
  );
}
