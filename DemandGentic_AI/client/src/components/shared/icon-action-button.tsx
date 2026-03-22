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
    
      {href ? (
        
          
        
      ) : (
        
      )}
    
  );

  return (
    
      
        
          {buttonContent}
        
        
          {label}
        
      
    
  );
}