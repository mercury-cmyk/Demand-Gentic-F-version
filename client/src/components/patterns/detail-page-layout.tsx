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
    <div className={cn("space-y-6", className)}>
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">{leftColumn}</div>
        <div className="space-y-6">{rightColumn}</div>
      </div>
    </div>
  );
}
