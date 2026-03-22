import { useState } from "react";
import { addHours, addDays, setHours, setMinutes, nextMonday, isBefore } from "date-fns";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, CalendarDays, Sun, Coffee } from "lucide-react";

interface ScheduleSendPopoverProps {
  children: React.ReactNode;
  onSchedule: (date: Date) => void;
  disabled?: boolean;
}

export function ScheduleSendPopover({ children, onSchedule, disabled }: ScheduleSendPopoverProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [selectedDate, setSelectedDate] = useState(undefined);
  const [selectedTime, setSelectedTime] = useState("09:00");

  const now = new Date();

  const presets = [
    {
      label: "Later today",
      icon: Clock,
      date: (() => {
        const d = addHours(now, 2);
        d.setMinutes(0, 0, 0);
        return d;
      })(),
      show: now.getHours() 
      
        {children}
      
      
        {showCustom ? (
          
            
              Pick date & time
               setShowCustom(false)}>
                Back
              
            
             isBefore(date, new Date(now.toDateString()))}
            />
            
              Time
               setSelectedTime(e.target.value)}
                className="h-8 text-sm"
              />
            
            
              Schedule for {selectedDate ? format(selectedDate, "MMM d") : "..."} at {selectedTime}
            
          
        ) : (
          
            
              Schedule Send
              Pick when to send this email
            
            {presets
              .filter((p) => p.show)
              .map((preset) => (
                 handlePreset(preset.date)}
                >
                  
                  
                    {preset.label}
                    
                      {format(preset.date, "EEE, MMM d · h:mm a")}
                    
                  
                
              ))}
            
             setShowCustom(true)}
            >
              
              Pick date & time...
            
          
        )}
      
    
  );
}