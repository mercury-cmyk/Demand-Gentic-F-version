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
  onOptionsLoaded?: (labels: Record<string, string>) => void;
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
  const { data, isLoading } = useQuery<{ data: MultiSelectOption[] }>({
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
      }, {} as Record<string, string>);
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
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between min-h-10 h-auto"
            data-testid={testId}
          >
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {value.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
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
                  placeholder={`Search ${label.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 p-0 h-9 focus-visible:ring-0"
                  data-testid={`input-search-${testId}`}
                />
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
                    Loading...
                  </div>
                ) : filteredOptions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No options found
                  </div>
                ) : (
                  filteredOptions.map((option) => {
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
                        <span className="flex-1 text-left">{option.name}</span>
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
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge
              key={option.id}
              variant="secondary"
              className="gap-1"
              data-testid={`chip-${option.id}`}
            >
              {option.name}
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
