import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import React from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageNavProps {
  /** Breadcrumb items - last item is current page (no link) */
  breadcrumbs?: BreadcrumbItem[];
  /** Custom back action. If not provided, uses browser history */
  onBack?: () => void;
  /** Whether to show the back button. Default: true */
  showBack?: boolean;
  /** Whether to show home in breadcrumbs. Default: true */
  showHome?: boolean;
  /** Additional class names */
  className?: string;
  /** Use dark theme styling */
  darkMode?: boolean;
}

/**
 * PageNav - Reusable navigation component with back button and breadcrumbs
 * 
 * Usage:
 * ```tsx
 * 
 * ```
 */
export function PageNav({
  breadcrumbs = [],
  onBack,
  showBack = true,
  showHome = true,
  className,
  darkMode = false,
}: PageNavProps) {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  const handleNavigate = (href: string) => {
    setLocation(href);
  };

  const textColor = darkMode ? "text-white/50" : "text-muted-foreground";
  const textColorHover = darkMode ? "hover:text-white" : "hover:text-foreground";
  const textColorActive = darkMode ? "text-white font-medium" : "text-foreground font-medium";
  const chevronColor = darkMode ? "text-white/30" : "text-muted-foreground/50";
  const buttonBg = darkMode 
    ? "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10" 
    : "bg-muted hover:bg-muted/80";

  return (
    
      {/* Back Button */}
      {showBack && (
        
          
        
      )}

      {/* Breadcrumbs */}
      
        {showHome && (
          <>
             handleNavigate('/dashboard')}
              className={cn(
                "flex items-center gap-1.5 transition-colors shrink-0",
                textColor,
                textColorHover
              )}
            >
              
              Home
            
            {breadcrumbs.length > 0 && (
              
            )}
          
        )}

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            
              {item.href && !isLast ? (
                 handleNavigate(item.href!)}
                  className={cn(
                    "transition-colors truncate max-w-[150px]",
                    textColor,
                    textColorHover
                  )}
                  title={item.label}
                >
                  {item.label}
                
              ) : (
                
                  {item.label}
                
              )}
              {!isLast && (
                
              )}
            
          );
        })}
      
    
  );
}

// Quick action buttons for common navigation patterns
interface QuickNavProps {
  className?: string;
  darkMode?: boolean;
}

export function QuickNavButtons({ className, darkMode = false }: QuickNavProps) {
  const [, setLocation] = useLocation();
  
  const buttonClass = darkMode 
    ? "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10" 
    : "";

  return (
    
       window.history.back()}
        className={cn("h-8 px-3", buttonClass)}
      >
        
        Back
      
    
  );
}