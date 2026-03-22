import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ChipsListItem {
  id: string;
  label: string;
  onClick?: () => void;
}

export interface ChipsListProps {
  title: string;
  items: ChipsListItem[];
  emptyLabel?: string;
  className?: string;
}

export function ChipsList({
  title,
  items,
  emptyLabel = "No items available",
  className,
}: ChipsListProps) {
  return (
    
      
        {title}
      
      {items.length === 0 ? (
        {emptyLabel}
      ) : (
        
          {items.map((item) => (
            
              {item.label}
            
          ))}
        
      )}
    
  );
}