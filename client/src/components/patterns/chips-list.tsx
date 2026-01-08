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
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={item.onClick}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
