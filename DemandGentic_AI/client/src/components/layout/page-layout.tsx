import { cn } from "@/lib/utils";
import React from "react";

interface PageLayoutProps extends React.HTMLAttributes {
  children: React.ReactNode;
}

export function PageLayout({ children, className, ...props }: PageLayoutProps) {
  return (
    
      {children}
    
  );
}

interface PageHeaderProps extends React.HTMLAttributes {
    children: React.ReactNode;
}

export function PageHeader({ children, className, ...props }: PageHeaderProps) {
    return (
        
            {children}
        
    );
}

interface PageContentProps extends React.HTMLAttributes {
    children: React.ReactNode;
}

export function PageContent({ children, className, ...props }: PageContentProps) {
    return (
        
            {children}
        
    );
}