
import { cn } from "@/lib/utils";
import React from "react";

interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageLayout({ children, className, ...props }: PageLayoutProps) {
  return (
    <div {...props} className={cn("h-screen flex flex-col", className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
    children: React.ReactNode;
}

export function PageHeader({ children, className, ...props }: PageHeaderProps) {
    return (
        <header {...props} className={cn("sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm", className)}>
            {children}
        </header>
    );
}

interface PageContentProps extends React.HTMLAttributes<HTMLElement> {
    children: React.ReactNode;
}

export function PageContent({ children, className, ...props }: PageContentProps) {
    return (
        <main {...props} className={cn("flex-1 overflow-hidden", className)}>
            {children}
        </main>
    );
}
