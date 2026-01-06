import { type Operator, getOperatorLabel } from "@shared/filterConfig";
import { cn } from "@/lib/utils";

interface OperatorPillsProps {
  options: Operator[];
  active: Operator;
  onChange: (operator: Operator) => void;
  className?: string;
}

export function OperatorPills({
  options,
  active,
  onChange,
  className
}: OperatorPillsProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} data-testid="operator-pills">
      {options.map((operator) => {
        const isActive = operator === active;
        return (
          <button
            key={operator}
            type="button"
            onClick={() => onChange(operator)}
            data-testid={`operator-pill-${operator}`}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {getOperatorLabel(operator)}
          </button>
        );
      })}
    </div>
  );
}
