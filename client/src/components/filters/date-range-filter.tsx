import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DATE_RANGE_PRESETS } from "@shared/filterConfig";

export interface DateRange {
  from?: string; // ISO date string
  to?: string;   // ISO date string
}

interface DateRangeFilterProps {
  label: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
  placeholder?: string;
  testId?: string;
}

export function DateRangeFilter({
  label,
  value,
  onChange,
  placeholder = "Select date range...",
  testId
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  const handlePresetClick = (days: number | null, index: number) => {
    if (days === null) {
      // Custom preset - don't change selection, just mark it
      setSelectedPreset(index);
      return;
    }

    const to = new Date();
    const from = subDays(to, days);
    
    onChange({
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd')
    });
    
    setSelectedPreset(index);
  };

  const handleCustomDateSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    
    if (range.from && range.to) {
      onChange({
        from: format(range.from, 'yyyy-MM-dd'),
        to: format(range.to, 'yyyy-MM-dd')
      });
      setSelectedPreset(DATE_RANGE_PRESETS.length - 1); // Custom preset
    } else if (range.from) {
      onChange({
        from: format(range.from, 'yyyy-MM-dd'),
        to: value.to
      });
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ from: undefined, to: undefined });
    setSelectedPreset(null);
  };

  const hasValue = value.from || value.to;

  const displayValue = () => {
    if (!value.from && !value.to) return placeholder;
    
    if (value.from && value.to) {
      return `${format(new Date(value.from), 'MMM d, yyyy')} - ${format(new Date(value.to), 'MMM d, yyyy')}`;
    }
    
    if (value.from) {
      return `From ${format(new Date(value.from), 'MMM d, yyyy')}`;
    }
    
    return `Until ${format(new Date(value.to!), 'MMM d, yyyy')}`;
  };

  const dateRange = {
    from: value.from ? new Date(value.from) : undefined,
    to: value.to ? new Date(value.to) : undefined
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between min-h-10"
            data-testid={testId}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className={cn(!hasValue && "text-muted-foreground")}>
                {displayValue()}
              </span>
            </div>
            {hasValue && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Presets Sidebar */}
            <div className="border-r p-3 space-y-1 min-w-[160px]">
              <p className="text-sm font-medium mb-2">Quick Select</p>
              {DATE_RANGE_PRESETS.map((preset, index) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start",
                    selectedPreset === index && "bg-accent"
                  )}
                  onClick={() => handlePresetClick(preset.days, index)}
                  data-testid={`preset-${preset.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Calendar */}
            <div className="p-3">
              <CalendarComponent
                mode="range"
                selected={dateRange}
                onSelect={handleCustomDateSelect}
                numberOfMonths={2}
                defaultMonth={dateRange.from}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected Date Chip */}
      {hasValue && (
        <Badge variant="secondary" className="gap-1 w-fit" data-testid={`chip-${testId}`}>
          {label}: {displayValue()}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={handleClear}
          />
        </Badge>
      )}
    </div>
  );
}
