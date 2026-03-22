import { useState, useMemo, useEffect } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
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

export interface MultiSelectOption {
  id: string;
  name: string;
  label?: string;
  [key: string]: any;
}

interface MultiSelectFilterProps {
  label: string;
  source: string; // API endpoint for fetching options
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
  placeholder?: string;
  testId?: string;
  onOptionsLoaded?: (labels: Record) => void;
}

export function MultiSelectFilter({
  label,
  source,
  value = [],
  onChange,
  max = 10,
  placeholder = "Select options...",
  testId,
  onOptionsLoaded
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch options from API
  const { data, isLoading } = useQuery({
    queryKey: [`/api/filters/options/${source}`],
  });

  const options = useMemo(() => {
    return (data?.data || []).map(opt => ({
      ...opt,
      name: opt.name || opt.label || opt.id
    }));
  }, [data]);

  // Register option labels when options are loaded (useEffect to avoid render loops)
  useEffect(() => {
    if (options.length > 0 && onOptionsLoaded) {
      const labels = options.reduce((acc, opt) => {
        acc[opt.id] = opt.name;
        return acc;
      }, {} as Record);
      onOptionsLoaded(labels);
    }
  }, [options, onOptionsLoaded]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter(option =>
      option.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  const selectedOptions = useMemo(() => {
    return options.filter(option => value.includes(option.id));
  }, [options, value]);

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
  };

  const handleRemove = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(id => id !== optionId));
  };

  const atMax = value.length >= max;

  return (
    
      
        
          
            
              {value.length === 0 ? (
                {placeholder}
              ) : (
                
                  {label} ({value.length}{max ? `/${max}` : ''})
                
              )}
            
            
          
        
        
          
            {/* Search Header */}
            
              
                
                 setSearchTerm(e.target.value)}
                  className="border-0 p-0 h-9 focus-visible:ring-0"
                  data-testid={`input-search-${testId}`}
                />
              
              {atMax && (
                
                  Maximum {max} selections allowed
                
              )}
            

            {/* Options List */}
            
              
                {isLoading ? (
                  
                    Loading...
                  
                ) : filteredOptions.length === 0 ? (
                  
                    No options found
                  
                ) : (
                  filteredOptions.map((option) => {
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
      {selectedOptions.length > 0 && (
        
          {selectedOptions.map((option) => (
            
              {option.name}
               handleRemove(option.id, e)}
              />
            
          ))}
        
      )}
    
  );
}