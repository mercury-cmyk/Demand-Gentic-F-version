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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
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
      show: now.getHours() < 20,
    },
    {
      label: "Tomorrow morning",
      icon: Coffee,
      date: setMinutes(setHours(addDays(now, 1), 9), 0),
      show: true,
    },
    {
      label: "Tomorrow afternoon",
      icon: Sun,
      date: setMinutes(setHours(addDays(now, 1), 14), 0),
      show: true,
    },
    {
      label: "Monday morning",
      icon: CalendarDays,
      date: setMinutes(setHours(nextMonday(now), 9), 0),
      show: now.getDay() !== 1 && now.getDay() !== 0,
    },
  ];

  function handlePreset(date: Date) {
    onSchedule(date);
    setOpen(false);
  }

  function handleCustomConfirm() {
    if (!selectedDate) return;
    const [hours, minutes] = selectedTime.split(":").map(Number);
    const scheduled = new Date(selectedDate);
    scheduled.setHours(hours, minutes, 0, 0);
    if (isBefore(scheduled, now)) return;
    onSchedule(scheduled);
    setOpen(false);
    setShowCustom(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {showCustom ? (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Pick date & time</h4>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCustom(false)}>
                Back
              </Button>
            </div>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => isBefore(date, new Date(now.toDateString()))}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs min-w-10">Time</Label>
              <Input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              className="w-full h-8 text-sm"
              onClick={handleCustomConfirm}
              disabled={!selectedDate}
            >
              Schedule for {selectedDate ? format(selectedDate, "MMM d") : "..."} at {selectedTime}
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            <div className="px-2 py-1.5">
              <h4 className="text-sm font-semibold">Schedule Send</h4>
              <p className="text-xs text-muted-foreground">Pick when to send this email</p>
            </div>
            {presets
              .filter((p) => p.show)
              .map((preset) => (
                <button
                  key={preset.label}
                  className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-muted/70 transition-colors text-left"
                  onClick={() => handlePreset(preset.date)}
                >
                  <preset.icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{preset.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(preset.date, "EEE, MMM d · h:mm a")}
                    </div>
                  </div>
                </button>
              ))}
            <div className="border-t my-1" />
            <button
              className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-muted/70 transition-colors text-left"
              onClick={() => setShowCustom(true)}
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Pick date & time...</span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
