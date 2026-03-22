import { Loader2 } from "lucide-react";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    
      
      {message}
    
  );
}

export function TableLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    
      {Array.from({ length: rows }).map((_, i) => (
        
      ))}
    
  );
}