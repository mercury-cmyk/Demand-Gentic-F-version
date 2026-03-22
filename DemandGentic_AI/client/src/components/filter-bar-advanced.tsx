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
    
      
        
          
           handleSearchChange(e.target.value)}
            data-testid="input-advanced-search"
          />
        

        
          
            
              Equals
            
            
              Not equal
            
            
              Contains
            
            
              Not contain
            
          
        

        
          
            
              Begins with
            
            
              Ends with
            
            
              Has value
            
            
              Is empty
            
          
        

        
          
            
            Advanced
          
          
            Apply Filters
          
          {activeFilters.length > 0 && (
            
              Clear All
            
          )}
        
      

      {activeFilters.length > 0 && (
        
          {activeFilters.map((filter) => (
            
              
              {filter.label}
              {onRemoveFilter && (
                 onRemoveFilter(filter.id)}
                  className="ml-1 hover:text-destructive transition-colors"
                  data-testid={`button-remove-filter-${filter.id}`}
                >
                  
                
              )}
            
          ))}
        
      )}
    
  );
}