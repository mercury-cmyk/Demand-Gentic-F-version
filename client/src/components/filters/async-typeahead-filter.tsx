import { useState, useMemo, useEffect, useCallback } from "react";
import { Check, ChevronsUpDown, Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

export interface TypeaheadOption {
  id: string;
  name: string;
  code?: string;
  [key: string]: any;
}

interface AsyncTypeaheadFilterProps {
  label: string;
  source: string; // API endpoint (e.g., 'countries', 'states', 'cities')
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
  placeholder?: string;
  parents?: Record<string, string[]>; // Parent filter dependencies (e.g., { countries: ['us', 'ca'] })
  testId?: string;
  onOptionsLoaded?: (labels: Record<string, string>) => void;
}

export function AsyncTypeaheadFilter({
  label,
  source,
  value = [],
  onChange,
  max = 10,
  placeholder = "Type to search...",
  parents = {},
  testId,
  onOptionsLoaded
}: AsyncTypeaheadFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search term (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Build query params with parent scoping
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    
    if (debouncedSearch) {
      params.append('query', debouncedSearch);
    }
    
    // Add parent filter scoping
    Object.entries(parents).forEach(([key, values]) => {
      if (values && values.length > 0) {
        params.append(key, values.join(','));
      }
    });
    
    return params.toString();
  }, [debouncedSearch, parents]);

  // Build full URL with query params
  const fetchUrl = useMemo(() => {
    const baseUrl = `/api/filters/options/${source}`;
    return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
  }, [source, queryParams]);

  // Fetch options with async type-ahead
  const { data, isLoading } = useQuery<{ data: TypeaheadOption[] }>({
    queryKey: [fetchUrl],
    enabled: open, // Only fetch when dropdown is open
  });

  const options = data?.data || [];

  // Register option labels when options are loaded
  useEffect(() => {
    if (options.length > 0 && onOptionsLoaded) {
      const labels = options.reduce((acc, opt) => {
        acc[opt.id] = opt.name;
        return acc;
      }, {} as Record<string, string>);
      onOptionsLoaded(labels);
    }
  }, [options, onOptionsLoaded]);

  // Get selected options from current value
  const selectedOptions = useMemo(() => {
    return options.filter(option => value.includes(option.id));
  }, [options, value]);

  // Also store previously selected options that might not be in current results
  const [cachedSelections, setCachedSelections] = useState<TypeaheadOption[]>([]);

  useEffect(() => {
    if (selectedOptions.length > 0) {
      setCachedSelections(prev => {
        const newSelections = selectedOptions.filter(
          opt => !prev.some(cached => cached.id === opt.id)
        );
        return [...prev, ...newSelections];
      });
    }
  }, [selectedOptions]);

  const displayedSelections = useMemo(() => {
    const allSelected = [...cachedSelections];
    selectedOptions.forEach(opt => {
      if (!allSelected.some(s => s.id === opt.id)) {
        allSelected.push(opt);
      }
    });
    return allSelected.filter(opt => value.includes(opt.id));
  }, [cachedSelections, selectedOptions, value]);

  const handleSelect = (optionId: string) => {
    const isSelected = value.includes(optionId);
    
    if (isSelected) {
      onChange(value.filter(id => id !== optionId));
    } else {
      if (value.length >= max) {
        return; // Don't add if at max
      }
      onChange([...value, optionId]);
    }
  };

  const handleClear = () => {
    onChange([]);
    setSearchTerm("");
    setDebouncedSearch("");
  };

  const handleRemove = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(id => id !== optionId));
  };

  const atMax = value.length >= max;

  // Check if parents are empty (for scoped filters)
  const hasRequiredParents = useMemo(() => {
    if (Object.keys(parents).length === 0) return true;
    return Object.values(parents).some(vals => vals && vals.length > 0);
  }, [parents]);

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between min-h-10 h-auto"
            data-testid={testId}
            disabled={!hasRequiredParents}
          >
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {value.length === 0 ? (
                <span className="text-muted-foreground">
                  {!hasRequiredParents ? `Select parent filter first` : placeholder}
                </span>
              ) : (
                <span className="font-medium">
                  {label} ({value.length}{max ? `/${max}` : ''})
                </span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="flex flex-col">
            {/* Search Header */}
            <div className="p-3 border-b">
              <div className="flex items-center gap-2 px-3 border rounded-md">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Type to search ${label.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 p-0 h-9 focus-visible:ring-0"
                  data-testid={`input-search-${testId}`}
                  autoFocus
                />
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {atMax && (
                <p className="text-xs text-orange-600 mt-2">
                  Maximum {max} selections allowed
                </p>
              )}
            </div>

            {/* Options List */}
            <ScrollArea className="h-[300px]">
              <div className="p-2">
                {isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Searching...
                  </div>
                ) : options.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {searchTerm || debouncedSearch 
                      ? "No results found" 
                      : `Type to search ${label.toLowerCase()}`}
                  </div>
                ) : (
                  options.map((option) => {
                    const isSelected = value.includes(option.id);
                    const isDisabled = !isSelected && atMax;
                    
                    return (
                      <button
                        key={option.id}
                        onClick={() => !isDisabled && handleSelect(option.id)}
                        disabled={isDisabled}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                          "hover:bg-accent hover:text-accent-foreground",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          isSelected && "bg-accent"
                        )}
                        data-testid={`option-${option.id}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isDisabled}
                          className="pointer-events-none"
                        />
                        <span className="flex-1 text-left">
                          {option.name}
                          {option.code && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({option.code})
                            </span>
                          )}
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            {value.length > 0 && (
              <div className="p-3 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {value.length} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  data-testid={`button-clear-${testId}`}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected Chips */}
      {displayedSelections.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {displayedSelections.map((option) => (
            <Badge
              key={option.id}
              variant="secondary"
              className="gap-1"
              data-testid={`chip-${option.id}`}
            >
              {option.name}
              {option.code && (
                <span className="text-xs opacity-70">({option.code})</span>
              )}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={(e) => handleRemove(option.id, e)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
