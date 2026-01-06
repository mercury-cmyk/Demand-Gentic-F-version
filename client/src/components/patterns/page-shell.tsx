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
    <div className={cn("flex flex-col h-full", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="px-6 pt-4 pb-2">
          <nav className="flex items-center space-x-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center">
                {index > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-foreground transition-colors"
                    data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="text-foreground font-medium"
                    data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {crumb.label}
                  </span>
                )}
              </div>
            ))}
          </nav>
        </div>
      )}

      {/* Page Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-foreground truncate" data-testid="page-title">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground" data-testid="page-description">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="ml-4 flex items-center gap-3" data-testid="page-actions">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
