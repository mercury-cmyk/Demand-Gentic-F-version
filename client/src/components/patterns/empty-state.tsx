import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  Inbox, 
  Users, 
  Building2, 
  Mail, 
  Phone, 
  ListChecks,
  Search,
  Filter,
  FileText,
  AlertCircle,
  CheckCircle2,
  LucideIcon
} from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center",
        className
      )}
      data-testid="empty-state"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 blur-3xl rounded-full" />
        <div className="relative rounded-full bg-muted p-6">
          <Icon className="h-12 w-12 text-muted-foreground" />
        </div>
      </div>

      <h3 className="mt-6 text-lg font-semibold text-foreground" data-testid="empty-state-title">
        {title}
      </h3>

      {description && (
        <p className="mt-2 text-sm text-muted-foreground max-w-md" data-testid="empty-state-description">
          {description}
        </p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || "default"}
              data-testid="empty-state-action"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="outline"
              data-testid="empty-state-secondary-action"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface NoResultsStateProps {
  searchQuery?: string;
  filterCount?: number;
  onClearFilters?: () => void;
  onClearSearch?: () => void;
  title?: string;
  description?: string;
  className?: string;
}

export function NoResultsState({
  searchQuery,
  filterCount = 0,
  onClearFilters,
  onClearSearch,
  title,
  description,
  className,
}: NoResultsStateProps) {
  const hasFilters = filterCount > 0 || !!searchQuery;

  const defaultTitle = hasFilters
    ? "No results found"
    : "No results";

  const defaultDescription = hasFilters
    ? `We couldn't find any matches for your ${
        searchQuery ? "search" : "filters"
      }. Try adjusting your criteria.`
    : "There are no items to display.";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center",
        className
      )}
      data-testid="no-results-state"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-muted/50 to-muted/30 blur-2xl rounded-full" />
        <div className="relative rounded-full bg-muted p-6">
          <Search className="h-12 w-12 text-muted-foreground" />
        </div>
      </div>

      <h3 className="mt-6 text-lg font-semibold text-foreground" data-testid="no-results-title">
        {title || defaultTitle}
      </h3>

      <p className="mt-2 text-sm text-muted-foreground max-w-md" data-testid="no-results-description">
        {description || defaultDescription}
      </p>

      {hasFilters && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2 text-sm text-muted-foreground">
          {searchQuery && (
            <div className="flex items-center gap-2">
              <span>
                Search: <span className="font-medium text-foreground">"{searchQuery}"</span>
              </span>
              {onClearSearch && (
                <Button
                  onClick={onClearSearch}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  data-testid="button-clear-search"
                >
                  Clear
                </Button>
              )}
            </div>
          )}
          {filterCount > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-3 w-3" />
              <span>
                {filterCount} {filterCount === 1 ? "filter" : "filters"} applied
              </span>
              {onClearFilters && (
                <Button
                  onClick={onClearFilters}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  data-testid="button-clear-filters"
                >
                  Clear all
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {hasFilters && (onClearFilters || onClearSearch) && (
        <Button
          onClick={() => {
            onClearFilters?.();
            onClearSearch?.();
          }}
          variant="outline"
          className="mt-6"
          data-testid="button-clear-all"
        >
          Clear All Filters
        </Button>
      )}
    </div>
  );
}

// Preset empty states for common scenarios
export const EmptyStates = {
  Accounts: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={Building2}
      title="No accounts yet"
      description="Get started by creating your first account or importing from a CSV file."
      {...props}
    />
  ),
  Contacts: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={Users}
      title="No contacts yet"
      description="Add your first contact or import a list to get started."
      {...props}
    />
  ),
  Campaigns: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={Mail}
      title="No campaigns yet"
      description="Create your first campaign to start engaging with your audience."
      {...props}
    />
  ),
  Leads: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={ListChecks}
      title="No leads to review"
      description="Leads will appear here once they're submitted for QA review."
      {...props}
    />
  ),
  Phone: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={Phone}
      title="No phone campaigns"
      description="Start a telemarketing campaign to connect with your prospects."
      {...props}
    />
  ),
  Success: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={CheckCircle2}
      title="All done!"
      description="Everything is up to date."
      {...props}
    />
  ),
  Error: (props: Partial<EmptyStateProps>) => (
    <EmptyState
      icon={AlertCircle}
      title="Something went wrong"
      description="We encountered an error. Please try again."
      {...props}
    />
  ),
};
