import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    
      
        
        
          
        
      
      
        {title}
      
      
        {description}
      
      {actionLabel && onAction && (
        
          {actionLabel}
        
      )}
    
  );
}