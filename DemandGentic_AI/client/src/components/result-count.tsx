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
      
        
        Loading results...
      
    );
  }

  const displayText = showTotal && total !== undefined
    ? `Showing ${count} of ${total} Results`
    : `Showing ${count.toLocaleString()} ${count === 1 ? 'Result' : 'Results'}`;

  return (
    
      {displayText}
      {count > 0 && (
        
      )}
    
  );
}