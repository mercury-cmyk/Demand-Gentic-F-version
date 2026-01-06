import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Globe, Calendar, Ban } from "lucide-react";

export interface BusinessHoursConfig {
  enabled: boolean;
  timezone: string;
  operatingDays: string[];
  startTime: string;
  endTime: string;
  respectContactTimezone: boolean;
  excludedDates?: string[];
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: true,
  timezone: 'America/New_York',
  operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  startTime: '09:00',
  endTime: '17:00',
  respectContactTimezone: true,
  excludedDates: [],
};

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'America/Phoenix', label: 'Arizona Time (MST)' },
  { value: 'America/Toronto', label: 'Canada Eastern' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const COMMON_HOLIDAYS_2024_2025 = [
  { value: '2024-12-25', label: 'Christmas 2024' },
  { value: '2025-01-01', label: 'New Year 2025' },
  { value: '2025-07-04', label: 'Independence Day 2025' },
  { value: '2025-11-27', label: 'Thanksgiving 2025' },
  { value: '2025-12-25', label: 'Christmas 2025' },
];

interface BusinessHoursConfigProps {
  value: BusinessHoursConfig;
  onChange: (config: BusinessHoursConfig) => void;
  className?: string;
}

export default function BusinessHoursConfigComponent({ value, onChange, className }: BusinessHoursConfigProps) {
  const [customHoliday, setCustomHoliday] = useState("");

  const handleToggle = (field: keyof BusinessHoursConfig, newValue: any) => {
    onChange({ ...value, [field]: newValue });
  };

  const handleDayToggle = (day: string) => {
    const newDays = value.operatingDays.includes(day)
      ? value.operatingDays.filter(d => d !== day)
      : [...value.operatingDays, day];
    onChange({ ...value, operatingDays: newDays });
  };

  const handleHolidayToggle = (holiday: string) => {
    const excludedDates = value.excludedDates || [];
    const newExcluded = excludedDates.includes(holiday)
      ? excludedDates.filter(d => d !== holiday)
      : [...excludedDates, holiday];
    onChange({ ...value, excludedDates: newExcluded });
  };

  const handleAddCustomHoliday = () => {
    if (customHoliday && /^\d{4}-\d{2}-\d{2}$/.test(customHoliday)) {
      const excludedDates = value.excludedDates || [];
      if (!excludedDates.includes(customHoliday)) {
        onChange({ ...value, excludedDates: [...excludedDates, customHoliday] });
      }
      setCustomHoliday("");
    }
  };

  const handleRemoveCustomHoliday = (date: string) => {
    const excludedDates = value.excludedDates || [];
    onChange({ ...value, excludedDates: excludedDates.filter(d => d !== date) });
  };

  const getBusinessHoursSummary = () => {
    if (!value.enabled) return '24/7 (No restrictions)';
    
    const days = value.operatingDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
    const hours = `${value.startTime} - ${value.endTime}`;
    const tz = TIMEZONES.find(t => t.value === value.timezone)?.label.split(' ')[0] || value.timezone;
    
    return `${days}: ${hours} ${tz}`;
  };

  const customHolidays = (value.excludedDates || []).filter(
    date => !COMMON_HOLIDAYS_2024_2025.some(h => h.value === date)
  );

  return (
    <Card className={className} data-testid="card-business-hours-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Business Hours Configuration
        </CardTitle>
        <CardDescription>
          Enforce calling restrictions based on timezone and business hours to ensure compliance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Business Hours</Label>
            <p className="text-sm text-muted-foreground">
              Restrict calls to specific days and times
            </p>
          </div>
          <Switch
            checked={value.enabled}
            onCheckedChange={(checked) => handleToggle('enabled', checked)}
            data-testid="switch-enable-business-hours"
          />
        </div>

        {value.enabled && (
          <>
            {/* Current Summary */}
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium">Current Configuration:</p>
              <p className="text-sm text-muted-foreground mt-1">{getBusinessHoursSummary()}</p>
              {value.respectContactTimezone && (
                <Badge variant="outline" className="mt-2">
                  <Globe className="h-3 w-3 mr-1" />
                  Respects Contact Timezone
                </Badge>
              )}
            </div>

            {/* Campaign Timezone */}
            <div className="space-y-2">
              <Label>Campaign Timezone</Label>
              <Select
                value={value.timezone}
                onValueChange={(v) => handleToggle('timezone', v)}
              >
                <SelectTrigger data-testid="select-campaign-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default timezone for the campaign when contact timezone is unknown
              </p>
            </div>

            {/* Operating Days */}
            <div className="space-y-2">
              <Label>Operating Days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS_OF_WEEK.map((day) => (
                  <Badge
                    key={day.value}
                    variant={value.operatingDays.includes(day.value) ? "default" : "outline"}
                    className="cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => handleDayToggle(day.value)}
                    data-testid={`badge-day-${day.value}`}
                  >
                    {day.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Operating Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={value.startTime}
                  onChange={(e) => handleToggle('startTime', e.target.value)}
                  data-testid="input-start-time"
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={value.endTime}
                  onChange={(e) => handleToggle('endTime', e.target.value)}
                  data-testid="input-end-time"
                />
              </div>
            </div>

            {/* Respect Contact Timezone */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Respect Contact Timezone</Label>
                <p className="text-sm text-muted-foreground">
                  Use contact's local timezone instead of campaign timezone
                </p>
              </div>
              <Switch
                checked={value.respectContactTimezone}
                onCheckedChange={(checked) => handleToggle('respectContactTimezone', checked)}
                data-testid="switch-respect-contact-timezone"
              />
            </div>

            {/* Holiday Exclusions */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Ban className="h-4 w-4" />
                Excluded Dates (Holidays)
              </Label>
              <div className="space-y-2">
                {/* Common Holidays */}
                <div className="flex gap-2 flex-wrap">
                  {COMMON_HOLIDAYS_2024_2025.map((holiday) => (
                    <Badge
                      key={holiday.value}
                      variant={(value.excludedDates || []).includes(holiday.value) ? "destructive" : "outline"}
                      className="cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => handleHolidayToggle(holiday.value)}
                      data-testid={`badge-holiday-${holiday.value}`}
                    >
                      {holiday.label}
                    </Badge>
                  ))}
                </div>

                {/* Custom Holidays */}
                {customHolidays.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">Custom Exclusions:</p>
                    <div className="flex gap-2 flex-wrap">
                      {customHolidays.map((date) => (
                        <Badge
                          key={date}
                          variant="destructive"
                          className="cursor-pointer hover-elevate active-elevate-2"
                          onClick={() => handleRemoveCustomHoliday(date)}
                          data-testid={`badge-custom-holiday-${date}`}
                        >
                          {date}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Custom Holiday */}
                <div className="flex gap-2 mt-2">
                  <Input
                    type="date"
                    value={customHoliday}
                    onChange={(e) => setCustomHoliday(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    data-testid="input-custom-holiday"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomHoliday}
                    className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover-elevate active-elevate-2"
                    data-testid="button-add-custom-holiday"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
