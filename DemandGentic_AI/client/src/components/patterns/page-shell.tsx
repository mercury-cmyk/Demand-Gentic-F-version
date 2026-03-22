import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageShellProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageShell({
  title,
  description,
  breadcrumbs,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        
          
            {breadcrumbs.map((crumb, index) => (
              
                {index > 0 && }
                {crumb.href ? (
                  
                    {crumb.label}
                  
                ) : (
                  
                    {crumb.label}
                  
                )}
              
            ))}
          
        
      )}

      {/* Page Header */}
      
        
          
            
              {title}
            
            {description && (
              
                {description}
              
            )}
          
          {actions && (
            
              {actions}
            
          )}
        
      

      {/* Page Content */}
      
        {children}
      
    
  );
}