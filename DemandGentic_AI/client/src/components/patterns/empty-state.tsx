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
    
      
        
        
          
        
      

      
        {title}
      

      {description && (
        
          {description}
        
      )}

      {children}

      {(action || secondaryAction) && (
        
          {action && (
            
              {action.label}
            
          )}
          {secondaryAction && (
            
              {secondaryAction.label}
            
          )}
        
      )}
    
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
    
      
        
        
          
        
      

      
        {title || defaultTitle}
      

      
        {description || defaultDescription}
      

      {hasFilters && (
        
          {searchQuery && (
            
              
                Search: "{searchQuery}"
              
              {onClearSearch && (
                
                  Clear
                
              )}
            
          )}
          {filterCount > 0 && (
            
              
              
                {filterCount} {filterCount === 1 ? "filter" : "filters"} applied
              
              {onClearFilters && (
                
                  Clear all
                
              )}
            
          )}
        
      )}

      {hasFilters && (onClearFilters || onClearSearch) && (
         {
            onClearFilters?.();
            onClearSearch?.();
          }}
          variant="outline"
          className="mt-6"
          data-testid="button-clear-all"
        >
          Clear All Filters
        
      )}
    
  );
}

// Preset empty states for common scenarios
export const EmptyStates = {
  Accounts: (props: Partial) => (
    
  ),
  Contacts: (props: Partial) => (
    
  ),
  Campaigns: (props: Partial) => (
    
  ),
  Leads: (props: Partial) => (
    
  ),
  Phone: (props: Partial) => (
    
  ),
  Success: (props: Partial) => (
    
  ),
  Error: (props: Partial) => (
    
  ),
};