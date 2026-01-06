import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Calendar, Clock, Zap } from "lucide-react";
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
  const [schedulingType, setSchedulingType] = useState<"now" | "scheduled">(data.scheduling?.type || "now");
  const [scheduleDate, setScheduleDate] = useState(data.scheduling?.date || "");
  const [scheduleTime, setScheduleTime] = useState(data.scheduling?.time || "");
  const [timezone, setTimezone] = useState(data.scheduling?.timezone || "UTC");
  const [throttle, setThrottle] = useState(data.scheduling?.throttle || "");
  const [assignedAgents, setAssignedAgents] = useState<string[]>(data.scheduling?.assignedAgents || []);

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
    <div className="space-y-6">
      {/* Campaign Goals & Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Campaign Goals & Timeline
          </CardTitle>
          <CardDescription>
            Set targets and timeline for your campaign
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="targetQualifiedLeads">
                Target Qualified Leads {campaignType === 'telemarketing' && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="targetQualifiedLeads"
                type="number"
                min="1"
                placeholder="e.g., 100"
                value={formData.targetQualifiedLeads}
                onChange={(e) => setFormData({ ...formData, targetQualifiedLeads: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Number of qualified leads you want to generate
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costPerLead" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Cost Per Lead (Optional)
              </Label>
              <Input
                id="costPerLead"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g., 25.00"
                value={formData.costPerLead}
                onChange={(e) => setFormData({ ...formData, costPerLead: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                For partner campaigns - cost per qualified lead
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Campaign Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.startDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {formData.startDate ? format(formData.startDate, "PPP") : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarUI
                    mode="single"
                    selected={formData.startDate}
                    onSelect={(date) => setFormData({ ...formData, startDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-sm text-muted-foreground">
                When campaign should start
              </p>
            </div>

            <div className="space-y-2">
              <Label>Campaign End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.endDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {formData.endDate ? format(formData.endDate, "PPP") : "Select end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarUI
                    mode="single"
                    selected={formData.endDate}
                    onSelect={(date) => setFormData({ ...formData, endDate: date })}
                    disabled={(date) => formData.startDate ? date < formData.startDate : false}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-sm text-muted-foreground">
                When campaign should end
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Type */}
      <Card>
        <CardHeader>
          <CardTitle>
            {campaignType === "email" ? "Send Schedule" : "Call Schedule"}
          </CardTitle>
          <CardDescription>
            {campaignType === "email"
              ? "Choose when to send your email campaign"
              : "Define call window and scheduling parameters"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={schedulingType} onValueChange={(v) => setSchedulingType(v as any)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="now" id="now" data-testid="radio-send-now" />
              <Label htmlFor="now" className="font-normal cursor-pointer">
                {campaignType === "email" ? "Send immediately after launch" : "Start calling immediately"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="scheduled" id="scheduled" data-testid="radio-schedule" />
              <Label htmlFor="scheduled" className="font-normal cursor-pointer">
                Schedule for later
              </Label>
            </div>
          </RadioGroup>

          {schedulingType === "scheduled" && (
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div className="space-y-2">
                <Label>
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Date
                </Label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  data-testid="input-schedule-date"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  <Clock className="w-4 h-4 inline mr-2" />
                  Time
                </Label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  data-testid="input-schedule-time"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger data-testid="select-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                <SelectItem value="Europe/London">London (GMT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pacing & Throttling */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Zap className="w-5 h-5 inline mr-2" />
            Pacing & Throttling
          </CardTitle>
          <CardDescription>
            {campaignType === "email"
              ? "Control email delivery rate to manage server load"
              : "Set call volume limits and agent assignment rules"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {campaignType === "email" ? (
            <>
              <div className="space-y-2">
                <Label>Maximum Emails per Minute</Label>
                <Input
                  type="number"
                  value={throttle}
                  onChange={(e) => setThrottle(e.target.value)}
                  placeholder="e.g., 100"
                  data-testid="input-throttle"
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: 50-200 emails/minute depending on your ESP limits
                </p>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm">
                  <p className="font-medium mb-1">AI-Optimized Send Time</p>
                  <p className="text-muted-foreground">
                    Enable AI to automatically adjust send times based on recipient engagement patterns (optional)
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" data-testid="button-enable-ai-timing">
                    Enable AI Optimization
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Call Window Start</Label>
                  <Input type="time" defaultValue="09:00" data-testid="input-call-window-start" />
                </div>
                <div className="space-y-2">
                  <Label>Call Window End</Label>
                  <Input type="time" defaultValue="18:00" data-testid="input-call-window-end" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Max Concurrent Calls per Agent</Label>
                <Input type="number" defaultValue="1" min="1" max="5" data-testid="input-max-concurrent" />
              </div>

              <div className="space-y-2">
                <Label>Frequency Cap (Days between calls to same contact)</Label>
                <Input type="number" defaultValue="7" min="1" data-testid="input-frequency-cap" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Assign Agents</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (assignedAgents.length === agents.length) {
                        setAssignedAgents([]);
                      } else {
                        setAssignedAgents(agents.map((a: any) => a.id));
                      }
                    }}
                    data-testid="button-toggle-all-agents"
                  >
                    {assignedAgents.length === agents.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>

                <div className="border rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                  {agents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No agents available
                    </p>
                  ) : (
                    agents.map((agent: any) => (
                      <div
                        key={agent.id}
                        className="flex items-center space-x-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          setAssignedAgents(prev =>
                            prev.includes(agent.id)
                              ? prev.filter(id => id !== agent.id)
                              : [...prev, agent.id]
                          );
                        }}
                        data-testid={`agent-item-${agent.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={assignedAgents.includes(agent.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setAssignedAgents(prev =>
                              prev.includes(agent.id)
                                ? prev.filter(id => id !== agent.id)
                                : [...prev, agent.id]
                            );
                          }}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {agent.firstName} {agent.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            @{agent.username}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          Agent
                        </Badge>
                      </div>
                    ))
                  )}
                </div>

                {assignedAgents.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {assignedAgents.length === agents.length
                      ? `All ${agents.length} agents assigned`
                      : `${assignedAgents.length} of ${agents.length} agent(s) assigned`}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Next Button */}
      <div className="flex justify-end">
        <Button onClick={handleNext} size="lg" data-testid="button-next-step">
          Continue to Compliance Review
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}