import { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface IconActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}

export function IconActionButton({
  icon: Icon,
  label,
  onClick,
  href,
  variant = "outline",
  size = "icon"
}: IconActionButtonProps) {
  const buttonContent = (
    <Button
      variant={variant}
      size={size}
      className="rounded-xl shadow-sm hover-elevate transition-all duration-200"
      onClick={onClick}
      asChild={!!href}
      data-testid={`button-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Icon className="size-4" />
        </a>
      ) : (
        <Icon className="size-4" />
      )}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {buttonContent}
        </TooltipTrigger>
        <TooltipContent className="text-xs font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
