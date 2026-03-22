import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DetailPageLayoutProps {
  header: ReactNode;
  leftColumn: ReactNode;
  rightColumn: ReactNode;
  className?: string;
}

export function DetailPageLayout({
  header,
  leftColumn,
  rightColumn,
  className,
}: DetailPageLayoutProps) {
  return (
    
      {header}
      
        {leftColumn}
        {rightColumn}
      
    
  );
}