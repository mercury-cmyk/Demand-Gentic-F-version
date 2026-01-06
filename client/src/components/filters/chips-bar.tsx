import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FilterValues, type FieldRule, getOperatorLabel, isTextOperator, isNullCheckOperator } from "@shared/filterConfig";
import { format } from "date-fns";

interface ChipsBarProps {
  filters: FilterValues;
  optionLabels?: Record<string, Record<string, string>>; // field -> id -> label mapping
  onRemove: (field: keyof FilterValues, value?: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function ChipsBar({
  filters,
  optionLabels = {},
  onRemove,
  onClearAll,
  className
}: ChipsBarProps) {
  // Helper to get display label for a field value
  const getLabel = (field: string, id: string): string => {
    return optionLabels[field]?.[id] || id;
  };

  // Helper to check if array contains FieldRule objects
  const isFieldRuleArray = (arr: unknown[]): arr is FieldRule[] => {
    return arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'operator' in arr[0];
  };

  // Count total active filters
  const totalFilters = Object.entries(filters).reduce((count, [key, value]) => {
    if (key === 'search' && value) return count + 1;
    if (Array.isArray(value) && value.length > 0) {
      if (isFieldRuleArray(value)) {
        // Count chips from FieldRule array
        return count + value.reduce((ruleCount, rule) => {
          if (isNullCheckOperator(rule.operator)) return ruleCount + 1;
          if (rule.values && rule.values.length > 0) return ruleCount + rule.values.length;
          if (rule.query && rule.query.trim()) return ruleCount + 1;
          return ruleCount;
        }, 0);
      }
      return count + value.length;
    }
    if (value && typeof value === 'object' && 'from' in value) {
      if (value.from || value.to) return count + 1;
    }
    return count;
  }, 0);

  // Helper to render chips for a field (handles both legacy string[] and new FieldRule[])
  const renderFieldChips = (field: keyof FilterValues, fieldLabel: string) => {
    const value = filters[field];
    if (!Array.isArray(value) || value.length === 0) return null;

    // Check if it's a FieldRule array
    if (isFieldRuleArray(value)) {
      // Render chips from FieldRule array
      return value.flatMap((rule, ruleIndex) => {
        const chips: JSX.Element[] = [];
        
        if (isNullCheckOperator(rule.operator)) {
          // Null-check operators: render operator label as chip
          chips.push(
            <Badge
              key={`${field}-rule-${ruleIndex}-null`}
              variant="secondary"
              className="gap-1"
              data-testid={`chip-${field}-null-${ruleIndex}`}
            >
              {fieldLabel}: {getOperatorLabel(rule.operator)}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onRemove(field)}
              />
            </Badge>
          );
        } else if (isTextOperator(rule.operator) && rule.query && rule.query.trim()) {
          // Text operators: render query as chip
          chips.push(
            <Badge
              key={`${field}-rule-${ruleIndex}-query`}
              variant="secondary"
              className="gap-1"
              data-testid={`chip-${field}-query-${ruleIndex}`}
            >
              {fieldLabel} {getOperatorLabel(rule.operator)}: "{rule.query}"
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onRemove(field)}
              />
            </Badge>
          );
        } else if (rule.values && rule.values.length > 0) {
          // Value operators: render each value as chip
          rule.values.forEach((val, valIndex) => {
            chips.push(
              <Badge
                key={`${field}-rule-${ruleIndex}-val-${valIndex}`}
                variant="secondary"
                className="gap-1"
                data-testid={`chip-${field}-${val}`}
              >
                {fieldLabel}: {getLabel(field, val)}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onRemove(field, val)}
                />
              </Badge>
            );
          });
        }
        
        return chips;
      });
    }

    // Legacy string[] format
    return value.map((val) => (
      <Badge
        key={val}
        variant="secondary"
        className="gap-1"
        data-testid={`chip-${field}-${val}`}
      >
        {fieldLabel}: {getLabel(field, val as string)}
        <X
          className="h-3 w-3 cursor-pointer"
          onClick={() => onRemove(field, val as string)}
        />
      </Badge>
    ));
  };

  if (totalFilters === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2 flex-wrap p-3 bg-muted/50 rounded-md border", className)}>
      <span className="text-sm font-medium text-muted-foreground">
        Active Filters ({totalFilters}):
      </span>

      {/* Search Filter */}
      {filters.search && (
        <Badge
          variant="secondary"
          className="gap-1"
          data-testid="chip-search"
        >
          Search: {filters.search}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => onRemove('search')}
          />
        </Badge>
      )}

      {/* Multi-select Array Filters - use helper to handle both legacy and FieldRule arrays */}
      {renderFieldChips('industries', 'Industry')}
      {renderFieldChips('companySizes', 'Company Size')}
      {renderFieldChips('companyRevenue', 'Revenue')}
      {renderFieldChips('seniorityLevels', 'Seniority')}
      {renderFieldChips('countries', 'Country')}
      {renderFieldChips('states', 'State')}
      {renderFieldChips('cities', 'City')}
      {renderFieldChips('technologies', 'Technology')}
      {/* {renderFieldChips('jobFunctions', 'Job Function')} */}
      {renderFieldChips('departments', 'Department')}
      {renderFieldChips('accountOwners', 'Owner')}

      {/* Date Range Filters */}
      {filters.createdDate && (filters.createdDate.from || filters.createdDate.to) && (
        <Badge
          variant="secondary"
          className="gap-1"
          data-testid="chip-created-date"
        >
          Created: {filters.createdDate.from && format(new Date(filters.createdDate.from), 'MMM d, yyyy')}
          {filters.createdDate.from && filters.createdDate.to && ' - '}
          {filters.createdDate.to && format(new Date(filters.createdDate.to), 'MMM d, yyyy')}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => onRemove('createdDate')}
          />
        </Badge>
      )}

      {filters.lastActivity && (filters.lastActivity.from || filters.lastActivity.to) && (
        <Badge
          variant="secondary"
          className="gap-1"
          data-testid="chip-last-activity"
        >
          Last Activity: {filters.lastActivity.from && format(new Date(filters.lastActivity.from), 'MMM d, yyyy')}
          {filters.lastActivity.from && filters.lastActivity.to && ' - '}
          {filters.lastActivity.to && format(new Date(filters.lastActivity.to), 'MMM d, yyyy')}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => onRemove('lastActivity')}
          />
        </Badge>
      )}

      {/* Clear All Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="ml-auto"
        data-testid="button-clear-all-filters"
      >
        Clear All
      </Button>
    </div>
  );
}
