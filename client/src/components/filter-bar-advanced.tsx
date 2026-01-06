import { useState } from "react";
import { Search, Filter, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface FilterChip {
  id: string;
  label: string;
}

interface AdvancedFilterBarProps {
  onSearch?: (query: string) => void;
  onFilterApply?: () => void;
  onFilterClear?: () => void;
  activeFilters?: FilterChip[];
  onRemoveFilter?: (id: string) => void;
  placeholder?: string;
}

export function AdvancedFilterBar({
  onSearch,
  onFilterApply,
  onFilterClear,
  activeFilters = [],
  onRemoveFilter,
  placeholder = "Search accounts, contacts, domains…"
}: AdvancedFilterBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [comparisonOperator, setComparisonOperator] = useState("contains");
  const [valueOperator, setValueOperator] = useState("hasvalue");

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <div className="w-full rounded-2xl bg-card shadow-smooth-lg p-4 border border-border animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            className="pl-9 w-80 h-10 rounded-xl border-input"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            data-testid="input-advanced-search"
          />
        </div>

        <Tabs value={comparisonOperator} onValueChange={setComparisonOperator} className="flex-1">
          <TabsList className="grid grid-cols-4 w-full max-w-xl bg-muted/50 rounded-xl">
            <TabsTrigger value="equals" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Equals
            </TabsTrigger>
            <TabsTrigger value="notequals" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Not equal
            </TabsTrigger>
            <TabsTrigger value="contains" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Contains
            </TabsTrigger>
            <TabsTrigger value="notcontains" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Not contain
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={valueOperator} onValueChange={setValueOperator} className="flex-1">
          <TabsList className="grid grid-cols-4 w-full max-w-xl bg-muted/50 rounded-xl">
            <TabsTrigger value="begins" className="rounded-lg data-[state=active]:bg-teal-accent data-[state=active]:text-white">
              Begins with
            </TabsTrigger>
            <TabsTrigger value="ends" className="rounded-lg data-[state=active]:bg-teal-accent data-[state=active]:text-white">
              Ends with
            </TabsTrigger>
            <TabsTrigger value="hasvalue" className="rounded-lg data-[state=active]:bg-teal-accent data-[state=active]:text-white">
              Has value
            </TabsTrigger>
            <TabsTrigger value="isempty" className="rounded-lg data-[state=active]:bg-teal-accent data-[state=active]:text-white">
              Is empty
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" className="rounded-xl" data-testid="button-advanced-filter">
            <SlidersHorizontal className="size-4 mr-2" />
            Advanced
          </Button>
          <Button 
            className="rounded-xl shadow-smooth" 
            onClick={onFilterApply}
            data-testid="button-apply-filters"
          >
            Apply Filters
          </Button>
          {activeFilters.length > 0 && (
            <Button 
              variant="ghost" 
              className="rounded-xl" 
              onClick={onFilterClear}
              data-testid="button-clear-filters"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.id}
              variant="secondary"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground border-0 shadow-sm"
            >
              <Filter className="size-3" />
              <span className="text-xs font-medium">{filter.label}</span>
              {onRemoveFilter && (
                <button
                  onClick={() => onRemoveFilter(filter.id)}
                  className="ml-1 hover:text-destructive transition-colors"
                  data-testid={`button-remove-filter-${filter.id}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
