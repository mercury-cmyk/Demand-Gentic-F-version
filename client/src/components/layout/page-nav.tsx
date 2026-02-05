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
 * <PageNav 
 *   breadcrumbs={[
 *     { label: "Content Studio", href: "/content-studio" },
 *     { label: "Preview Studio" } // current page, no href
 *   ]}
 * />
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
    <div className={cn("flex items-center gap-3", className)}>
      {/* Back Button */}
      {showBack && (
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
          className={cn("h-9 w-9 rounded-xl shrink-0", buttonBg)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm overflow-hidden">
        {showHome && (
          <>
            <button 
              onClick={() => handleNavigate('/dashboard')}
              className={cn(
                "flex items-center gap-1.5 transition-colors shrink-0",
                textColor,
                textColorHover
              )}
            >
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Home</span>
            </button>
            {breadcrumbs.length > 0 && (
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", chevronColor)} />
            )}
          </>
        )}

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <React.Fragment key={index}>
              {item.href && !isLast ? (
                <button 
                  onClick={() => handleNavigate(item.href!)}
                  className={cn(
                    "transition-colors truncate max-w-[150px]",
                    textColor,
                    textColorHover
                  )}
                  title={item.label}
                >
                  {item.label}
                </button>
              ) : (
                <span 
                  className={cn("truncate max-w-[200px]", textColorActive)}
                  title={item.label}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", chevronColor)} />
              )}
            </React.Fragment>
          );
        })}
      </nav>
    </div>
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
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.history.back()}
        className={cn("h-8 px-3", buttonClass)}
      >
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        Back
      </Button>
    </div>
  );
}
