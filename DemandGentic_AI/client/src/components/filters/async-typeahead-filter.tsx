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
  parents?: Record; // Parent filter dependencies (e.g., { countries: ['us', 'ca'] })
  testId?: string;
  onOptionsLoaded?: (labels: Record) => void;
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
  const { data, isLoading } = useQuery({
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
      }, {} as Record);
      onOptionsLoaded(labels);
    }
  }, [options, onOptionsLoaded]);

  // Get selected options from current value
  const selectedOptions = useMemo(() => {
    return options.filter(option => value.includes(option.id));
  }, [options, value]);

  // Also store previously selected options that might not be in current results
  const [cachedSelections, setCachedSelections] = useState([]);

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
    
      
        
          
            
              {value.length === 0 ? (
                
                  {!hasRequiredParents ? `Select parent filter first` : placeholder}
                
              ) : (
                
                  {label} ({value.length}{max ? `/${max}` : ''})
                
              )}
            
            
          
        
        
          
            {/* Search Header */}
            
              
                
                 setSearchTerm(e.target.value)}
                  className="border-0 p-0 h-9 focus-visible:ring-0"
                  data-testid={`input-search-${testId}`}
                  autoFocus
                />
                {isLoading && }
              
              {atMax && (
                
                  Maximum {max} selections allowed
                
              )}
            

            {/* Options List */}
            
              
                {isLoading ? (
                  
                    
                    Searching...
                  
                ) : options.length === 0 ? (
                  
                    {searchTerm || debouncedSearch 
                      ? "No results found" 
                      : `Type to search ${label.toLowerCase()}`}
                  
                ) : (
                  options.map((option) => {
                    const isSelected = value.includes(option.id);
                    const isDisabled = !isSelected && atMax;
                    
                    return (
                       !isDisabled && handleSelect(option.id)}
                        disabled={isDisabled}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                          "hover:bg-accent hover:text-accent-foreground",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          isSelected && "bg-accent"
                        )}
                        data-testid={`option-${option.id}`}
                      >
                        
                        
                          {option.name}
                          {option.code && (
                            
                              ({option.code})
                            
                          )}
                        
                        {isSelected && }
                      
                    );
                  })
                )}
              
            

            {/* Footer */}
            {value.length > 0 && (
              
                
                  {value.length} selected
                
                
                  Clear all
                
              
            )}
          
        
      

      {/* Selected Chips */}
      {displayedSelections.length > 0 && (
        
          {displayedSelections.map((option) => (
            
              {option.name}
              {option.code && (
                ({option.code})
              )}
               handleRemove(option.id, e)}
              />
            
          ))}
        
      )}
    
  );
}