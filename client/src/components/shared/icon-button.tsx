import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LucideIcon } from "lucide-react";

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
  className?: string;
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  href,
  variant = "ghost",
  size = "icon",
  disabled = false,
  loading = false,
  testId,
  className,
}: IconButtonProps) {
  const button = (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      data-testid={testId}
      className={className}
      asChild={!!href}
    >
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Icon className="w-4 h-4" />
        </a>
      ) : (
        <Icon className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
      )}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
