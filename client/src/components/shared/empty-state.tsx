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
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl animate-pulse-glow"></div>
        <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/20 to-teal-accent/20 flex items-center justify-center">
          <Icon className="h-12 w-12 text-primary" />
        </div>
      </div>
      <h3 className="text-xl font-semibold mb-2 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-8 max-w-md leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button 
          onClick={onAction} 
          data-testid="button-empty-state-action"
          size="lg"
          className="shadow-smooth"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
