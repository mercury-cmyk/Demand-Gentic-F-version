import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Calendar, Clock, Zap, Globe, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Target, DollarSign } from "lucide-react";


interface Step3Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

export function Step3Scheduling({ data, onNext, campaignType }: Step3Props) {
  const [schedulingType, setSchedulingType] = useState(data.scheduling?.type || "now");
  const [scheduleDate, setScheduleDate] = useState(data.scheduling?.date || "");
  const [scheduleTime, setScheduleTime] = useState(data.scheduling?.time || "");
  const [timezone, setTimezone] = useState(data.scheduling?.timezone || "UTC");
  const [throttle, setThrottle] = useState(data.scheduling?.throttle || "");
  const [assignedAgents, setAssignedAgents] = useState(data.scheduling?.assignedAgents || []);

  const [formData, setFormData] = useState({
    type: data?.scheduling?.type || 'immediate',
    date: data?.scheduling?.date ? new Date(data?.scheduling?.date) : new Date(),
    time: data?.scheduling?.time || '09:00',
    timezone: data?.scheduling?.timezone || 'UTC',
    dialingPace: data?.scheduling?.dialingPace || 'normal',
    assignedAgents: data?.scheduling?.assignedAgents || [],
    targetQualifiedLeads: data?.scheduling?.targetQualifiedLeads || '',
    startDate: data?.scheduling?.startDate ? new Date(data?.scheduling?.startDate) : undefined,
    endDate: data?.scheduling?.endDate ? new Date(data?.scheduling?.endDate) : undefined,
    costPerLead: data?.scheduling?.costPerLead || '',
  });

  // Fetch available agents for telemarketing campaigns
  const { data: agents = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users", {
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Failed to fetch agents");
      const users = await response.json();
      // Filter to only show users with 'agent' role (multi-role support)
      return users.filter((user: any) => {
        const userRoles = user.roles || [user.role];
        return userRoles.includes('agent');
      });
    },
    enabled: campaignType === "telemarketing",
  });

  const handleNext = () => {
    onNext({
      scheduling: {
        type: schedulingType,
        date: scheduleDate,
        time: scheduleTime,
        timezone,
        dialingPace: throttle,
        assignedAgents: campaignType === "telemarketing" ? assignedAgents : undefined,
        targetQualifiedLeads: formData.targetQualifiedLeads,
        startDate: formData.startDate,
        endDate: formData.endDate,
        costPerLead: formData.costPerLead,
      },
    });
  };

  return (
    
      {/* Campaign Goals & Timeline */}
      
        
          
            
            Campaign Goals & Timeline
          
          
            Set targets and timeline for your campaign
          
        
        
          
            
              
                Target Qualified Leads {campaignType === 'telemarketing' && *}
              
               setFormData({ ...formData, targetQualifiedLeads: e.target.value })}
              />
              
                Number of qualified leads you want to generate
              
            

            
              
                
                Cost Per Lead (Optional)
              
               setFormData({ ...formData, costPerLead: e.target.value })}
              />
              
                For partner campaigns - cost per qualified lead
              
            
          

          

          
            
              Campaign Start Date
              
                
                  
                    
                    {formData.startDate ? format(formData.startDate, "PPP") : "Select start date"}
                  
                
                
                   setFormData({ ...formData, startDate: date })}
                    initialFocus
                  />
                
              
              
                When campaign should start
              
            

            
              Campaign End Date
              
                
                  
                    
                    {formData.endDate ? format(formData.endDate, "PPP") : "Select end date"}
                  
                
                
                   setFormData({ ...formData, endDate: date })}
                    disabled={(date) => formData.startDate ? date 
                
              
              
                When campaign should end
              
            
          
        
      

      {/* Schedule Type - Email Only */}
      {campaignType === "email" && (
        
          
            Send Schedule
            Choose when to send your email campaign
          
          
             setSchedulingType(v as any)}>
              
                
                
                  Send immediately after launch
                
              
              
                
                
                  Schedule for later
                
              
            

            {schedulingType === "scheduled" && (
              
                
                  
                    
                    Date
                  
                   setScheduleDate(e.target.value)}
                    data-testid="input-schedule-date"
                  />
                
                
                  
                    
                    Time
                  
                   setScheduleTime(e.target.value)}
                    data-testid="input-schedule-time"
                  />
                
              
            )}

            
              Timezone
              
                
                  
                
                
                  UTC (Coordinated Universal Time)
                  Eastern Time (ET)
                  Central Time (CT)
                  Mountain Time (MT)
                  Pacific Time (PT)
                  London (GMT)
                
              
            
          
        
      )}

      {/* Pacing & Throttling */}
      
        
          
            
            Pacing & Throttling
          
          
            {campaignType === "email"
              ? "Control email delivery rate to manage server load"
              : "Set call volume limits and agent assignment rules"}
          
        
        
          {campaignType === "email" ? (
            <>
              
                Maximum Emails per Minute
                 setThrottle(e.target.value)}
                  placeholder="e.g., 100"
                  data-testid="input-throttle"
                />
                
                  Recommended: 50-200 emails/minute depending on your ESP limits
                
              

              
                
                  AI-Optimized Send Time
                  
                    Enable AI to automatically adjust send times based on recipient engagement patterns (optional)
                  
                  
                    Enable AI Optimization
                  
                
              
            
          ) : (
            <>
              {/* Business Hours Info */}
              
                
                  
                  
                    Smart Timezone Detection
                    
                      Calls will be placed during business hours (9:00 AM - 6:00 PM) in each contact's local timezone,
                      automatically determined from their country and location data.
                    
                  
                
              

              
                
                  Business Hours Start
                  
                  In contact's local time
                
                
                  Business Hours End
                  
                  In contact's local time
                
              

              
                Max Concurrent Calls per Agent
                
              

              
                Frequency Cap (Days between calls to same contact)
                
              
            
          )}
        
      

      {/* Next Button */}
      
        
          Continue to Compliance Review
          
        
      
    
  );
}