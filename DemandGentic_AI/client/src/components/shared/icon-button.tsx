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
    
      {href ? (
        
          
        
      ) : (
        
      )}
    
  );

  return (
    
      {button}
      
        {label}
      
    
  );
}