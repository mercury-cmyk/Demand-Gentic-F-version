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
    
      
        
          
          Business Hours Configuration
        
        
          Enforce calling restrictions based on timezone and business hours to ensure compliance
        
      
      
        {/* Enable/Disable Toggle */}
        
          
            Enable Business Hours
            
              Restrict calls to specific days and times
            
          
           handleToggle('enabled', checked)}
            data-testid="switch-enable-business-hours"
          />
        

        {value.enabled && (
          <>
            {/* Current Summary */}
            
              Current Configuration:
              {getBusinessHoursSummary()}
              {value.respectContactTimezone && (
                
                  
                  Respects Contact Timezone
                
              )}
            

            {/* Campaign Timezone */}
            
              Campaign Timezone
               handleToggle('timezone', v)}
              >
                
                  
                
                
                  {TIMEZONES.map((tz) => (
                    
                      {tz.label}
                    
                  ))}
                
              
              
                Default timezone for the campaign when contact timezone is unknown
              
            

            {/* Operating Days */}
            
              Operating Days
              
                {DAYS_OF_WEEK.map((day) => (
                   handleDayToggle(day.value)}
                    data-testid={`badge-day-${day.value}`}
                  >
                    {day.label}
                  
                ))}
              
            

            {/* Operating Hours */}
            
              
                Start Time
                 handleToggle('startTime', e.target.value)}
                  data-testid="input-start-time"
                />
              
              
                End Time
                 handleToggle('endTime', e.target.value)}
                  data-testid="input-end-time"
                />
              
            

            {/* Respect Contact Timezone */}
            
              
                Respect Contact Timezone
                
                  Use contact's local timezone instead of campaign timezone
                
              
               handleToggle('respectContactTimezone', checked)}
                data-testid="switch-respect-contact-timezone"
              />
            

            {/* Holiday Exclusions */}
            
              
                
                Excluded Dates (Holidays)
              
              
                {/* Common Holidays */}
                
                  {COMMON_HOLIDAYS_2024_2025.map((holiday) => (
                     handleHolidayToggle(holiday.value)}
                      data-testid={`badge-holiday-${holiday.value}`}
                    >
                      {holiday.label}
                    
                  ))}
                

                {/* Custom Holidays */}
                {customHolidays.length > 0 && (
                  
                    Custom Exclusions:
                    
                      {customHolidays.map((date) => (
                         handleRemoveCustomHoliday(date)}
                          data-testid={`badge-custom-holiday-${date}`}
                        >
                          {date}
                        
                      ))}
                    
                  
                )}

                {/* Add Custom Holiday */}
                
                   setCustomHoliday(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    data-testid="input-custom-holiday"
                  />
                  
                    Add
                  
                
              
            
          
        )}
      
    
  );
}