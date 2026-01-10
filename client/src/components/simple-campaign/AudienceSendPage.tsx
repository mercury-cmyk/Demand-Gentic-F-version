/**
 * AudienceSendPage - Page 3 of Simple Campaign Builder
 * 
 * After saving the template, user returns here for:
 * - Select Audience (Segment, List, or Filtered)
 * - Send Options (Send now or Schedule)
 * - Final Review (Campaign name, Sender, Subject, Template preview, Audience count)
 * - Launch Campaign CTA
 */

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Users,
  Calendar,
  Send,
  Mail,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Rocket,
  Eye,
  Target,
  Filter,
  List,
  Loader2,
  CalendarClock,
  SlidersHorizontal,
  Lock,
  Gauge
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import type { FilterGroup } from "@shared/filter-types";

interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
}

interface TemplateData {
  subject: string;
  preheader: string;
  bodyContent: string;
  htmlContent: string;
}

interface Segment {
  id: string;
  name: string;
  contactCount?: number;
}

interface ContactList {
  id: string;
  name: string;
  contactCount?: number;
}

interface AudienceSendPageProps {
  campaignIntent: CampaignIntent;
  template: TemplateData;
  onBack: () => void;
  onEditTemplate: () => void;
  onLaunch: (launchData: LaunchData) => void;
}

interface LaunchData {
  audienceType: "segment" | "list" | "all" | "filters";
  audienceId?: string;
  audienceName?: string;
  audienceCount: number;
  filterGroup?: FilterGroup;
  sendType: "now" | "scheduled";
  scheduledDate?: string;
  scheduledTime?: string;
  timezone?: string;
  throttlingLimit?: number;
}

export function AudienceSendPage({
  campaignIntent,
  template,
  onBack,
  onEditTemplate,
  onLaunch
}: AudienceSendPageProps) {
  const { toast } = useToast();
  
  // Audience state
  const [audienceType, setAudienceType] = useState<"segment" | "list" | "all" | "filters">("segment");
  const [selectedSegment, setSelectedSegment] = useState<string>("");
  const [selectedList, setSelectedList] = useState<string>("");
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(undefined);
  const [appliedFilterGroup, setAppliedFilterGroup] = useState<FilterGroup | undefined>(undefined);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loadingAudience, setLoadingAudience] = useState(true);
  const [audienceCount, setAudienceCount] = useState<number>(0);
  const [countingAudience, setCountingAudience] = useState(false);
  
  // Send options state
  const [sendType, setSendType] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<string>("09:00");
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [throttlingLimit, setThrottlingLimit] = useState<number | undefined>(undefined);
  
  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [launching, setLaunching] = useState(false);
  
  // Fetch segments and lists
  useEffect(() => {
    const fetchAudienceOptions = async () => {
      try {
        setLoadingAudience(true);
        const [segmentsRes, listsRes] = await Promise.all([
          apiRequest("GET", "/api/segments"),
          apiRequest("GET", "/api/lists")
        ]);
        
        const segmentsData = await segmentsRes.json();
        const listsData = await listsRes.json();
        
        setSegments(segmentsData || []);
        setLists(listsData || []);
      } catch (error) {
        console.error("Failed to fetch audience options:", error);
        toast({
          title: "Error",
          description: "Failed to load audience options",
          variant: "destructive"
        });
      } finally {
        setLoadingAudience(false);
      }
    };
    
    fetchAudienceOptions();
  }, []);
  
  // Get audience count when selection changes
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    
    const getAudienceCount = async () => {
      // Reset count when no valid selection
      if (audienceType === "segment" && !selectedSegment) {
        setAudienceCount(0);
        setCountingAudience(false);
        return;
      }
      if (audienceType === "list" && !selectedList) {
        setAudienceCount(0);
        setCountingAudience(false);
        return;
      }
      if (audienceType === "filters" && (!appliedFilterGroup || (appliedFilterGroup.conditions?.length ?? 0) === 0)) {
        setAudienceCount(0);
        setCountingAudience(false);
        return;
      }
      
      setCountingAudience(true);
      
      try {
        if (audienceType === "all") {
          const res = await apiRequest("POST", "/api/filters/count/contact", {});
          const data = await res.json();
          if (!cancelled) {
            setAudienceCount(data.count || 0);
          }
        } else if (audienceType === "filters" && appliedFilterGroup) {
          console.log('[AudienceSendPage] Fetching filter count for:', JSON.stringify(appliedFilterGroup, null, 2));
          // Filter count can be slow, add timeout
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('timeout')), 30000)
          );
          // API expects { filterGroup: ... } wrapper
          const fetchPromise = apiRequest("POST", "/api/filters/count/contact", { filterGroup: appliedFilterGroup });
          
          try {
            const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;
            const data = await res.json();
            console.log('[AudienceSendPage] Filter count response:', data);
            if (!cancelled) {
              setAudienceCount(data.count || 0);
            }
          } catch (err: any) {
            if (err?.message === 'timeout') {
              console.log('[AudienceSendPage] Filter count timed out, showing estimate');
              if (!cancelled) {
                setAudienceCount(-1); // -1 indicates estimate needed
              }
            } else {
              throw err;
            }
          }
        } else if (audienceType === "segment" && selectedSegment) {
          const segment = segments.find(s => s.id === selectedSegment);
          if (segment?.contactCount) {
            if (!cancelled) setAudienceCount(segment.contactCount);
          } else {
            const res = await apiRequest("GET", `/api/segments/${selectedSegment}/count`);
            const data = await res.json();
            if (!cancelled) {
              setAudienceCount(data.count || 0);
            }
          }
        } else if (audienceType === "list" && selectedList) {
          const list = lists.find(l => l.id === selectedList);
          if (list?.contactCount) {
            if (!cancelled) setAudienceCount(list.contactCount);
          } else {
            const res = await apiRequest("GET", `/api/lists/${selectedList}/count`);
            const data = await res.json();
            if (!cancelled) {
              setAudienceCount(data.count || 0);
            }
          }
        }
      } catch (error) {
        console.error('[AudienceSendPage] Error getting audience count:', error);
        if (!cancelled) {
          setAudienceCount(0);
        }
      } finally {
        if (!cancelled) {
          setCountingAudience(false);
        }
      }
    };
    
    getAudienceCount();
    
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [audienceType, selectedSegment, selectedList, segments, lists, appliedFilterGroup]);
  
  // Validation
  const isValid = useMemo(() => {
    if (audienceType === "segment" && !selectedSegment) return false;
    if (audienceType === "list" && !selectedList) return false;
    if (audienceType === "filters" && (!appliedFilterGroup || (appliedFilterGroup.conditions?.length ?? 0) === 0)) return false;
    if (sendType === "scheduled" && (!scheduledDate || !scheduledTime)) return false;
    if (throttlingLimit !== undefined && throttlingLimit > 1000) return false;
    // Allow -1 (large audience estimate) or any positive count
    return audienceCount > 0 || audienceCount === -1;
  }, [audienceType, selectedSegment, selectedList, appliedFilterGroup, sendType, scheduledDate, scheduledTime, audienceCount, throttlingLimit]);
  
  // Get selected audience name
  const audienceName = useMemo(() => {
    if (audienceType === "all") return "All Contacts";
    if (audienceType === "filters") return "Custom Filtered Audience";
    if (audienceType === "segment" && selectedSegment) {
      return segments.find(s => s.id === selectedSegment)?.name || "Selected Segment";
    }
    if (audienceType === "list" && selectedList) {
      return lists.find(l => l.id === selectedList)?.name || "Selected List";
    }
    return "Not selected";
  }, [audienceType, selectedSegment, selectedList, segments, lists]);
  
  // Handle launch
  const handleLaunch = async () => {
    if (!isValid) return;
    
    setLaunching(true);
    try {
      await onLaunch({
        audienceType,
        audienceId: audienceType === "segment" ? selectedSegment : audienceType === "list" ? selectedList : undefined,
        audienceName,
        audienceCount,
        filterGroup: audienceType === "filters" ? appliedFilterGroup : undefined,
        sendType,
        scheduledDate: sendType === "scheduled" ? scheduledDate : undefined,
        scheduledTime: sendType === "scheduled" ? scheduledTime : undefined,
        timezone: sendType === "scheduled" ? timezone : undefined,
        throttlingLimit
      });
    } catch (error) {
      toast({
        title: "Launch failed",
        description: "Failed to launch campaign. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLaunching(false);
    }
  };
  
  // Set default date to tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduledDate(tomorrow.toISOString().split("T")[0]);
  }, []);
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="border-b bg-white px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{campaignIntent.campaignName}</h1>
              <p className="text-xs text-slate-500">Select audience and launch</p>
            </div>
          </div>
          
          <Badge variant="secondary" className="text-xs">
            Step 3 of 3
          </Badge>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        {/* Step 1: Select Audience */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Select Audience</CardTitle>
                <CardDescription className="text-xs">Choose who will receive this campaign</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingAudience ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <RadioGroup
                  value={audienceType}
                  onValueChange={(v) => setAudienceType(v as "segment" | "list" | "filters" | "all")}
                  className="space-y-3"
                >
                  {/* Segment Option */}
                  <div className={`flex items-start space-x-3 p-4 rounded-lg border ${audienceType === "segment" ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                    <RadioGroupItem value="segment" id="segment" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="segment" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <Filter className="w-4 h-4 text-blue-500" />
                        Segment
                      </Label>
                      <p className="text-xs text-slate-500 mt-1">Dynamic audience based on filters</p>
                      
                      {audienceType === "segment" && (
                        <div className="mt-3">
                          <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Choose a segment" />
                            </SelectTrigger>
                            <SelectContent>
                              {segments.length === 0 ? (
                                <div className="p-3 text-sm text-slate-500">No segments found</div>
                              ) : (
                                segments.map((segment) => (
                                  <SelectItem key={segment.id} value={segment.id}>
                                    <div className="flex items-center justify-between w-full gap-4">
                                      <span>{segment.name}</span>
                                      {segment.contactCount !== undefined && (
                                        <span className="text-xs text-slate-400">{segment.contactCount.toLocaleString()} contacts</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* List Option */}
                  <div className={`flex items-start space-x-3 p-4 rounded-lg border ${audienceType === "list" ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                    <RadioGroupItem value="list" id="list" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="list" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <List className="w-4 h-4 text-green-500" />
                        List
                      </Label>
                      <p className="text-xs text-slate-500 mt-1">Static list of contacts</p>
                      
                      {audienceType === "list" && (
                        <div className="mt-3">
                          <Select value={selectedList} onValueChange={setSelectedList}>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Choose a list" />
                            </SelectTrigger>
                            <SelectContent>
                              {lists.length === 0 ? (
                                <div className="p-3 text-sm text-slate-500">No lists found</div>
                              ) : (
                                lists.map((list) => (
                                  <SelectItem key={list.id} value={list.id}>
                                    <div className="flex items-center justify-between w-full gap-4">
                                      <span>{list.name}</span>
                                      {list.contactCount !== undefined && (
                                        <span className="text-xs text-slate-400">{list.contactCount.toLocaleString()} contacts</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* All Contacts Option */}
                  <div className={`flex items-start space-x-3 p-4 rounded-lg border ${audienceType === "all" ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                    <RadioGroupItem value="all" id="all" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="all" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <Users className="w-4 h-4 text-purple-500" />
                        All Contacts
                      </Label>
                      <p className="text-xs text-slate-500 mt-1">Send to entire contact database</p>
                    </div>
                  </div>
                  
                  {/* Advanced Filters Option */}
                  <div className={`flex items-start space-x-3 p-4 rounded-lg border ${audienceType === "filters" ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                    <RadioGroupItem value="filters" id="filters" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="filters" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <SlidersHorizontal className="w-4 h-4 text-orange-500" />
                        Advanced Filters
                      </Label>
                      <p className="text-xs text-slate-500 mt-1">Build custom filter criteria</p>
                      
                      {audienceType === "filters" && (
                        <div className="mt-3 border rounded-lg p-3 bg-white">
                          <SidebarFilters
                            entityType="contact"
                            onApplyFilter={(applied: FilterGroup | undefined) => {
                              console.log('[AudienceSendPage] onApplyFilter called with:', JSON.stringify(applied, null, 2));
                              setFilterGroup(applied || { logic: "AND", conditions: [] });
                              setAppliedFilterGroup(applied);
                            }}
                            initialFilter={filterGroup}
                            embedded={true}
                          />
                          {appliedFilterGroup && (appliedFilterGroup.conditions?.length ?? 0) > 0 && (
                            <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-700 flex items-center gap-2">
                              <Lock className="w-3 h-3" />
                              Filters applied - {appliedFilterGroup.conditions?.length} condition(s)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </RadioGroup>
                
                {/* Audience Count */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                  <span className="text-sm text-slate-600">Selected audience:</span>
                  <div className="flex items-center gap-2">
                    {countingAudience ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        <span className="text-sm text-slate-500">Counting...</span>
                      </>
                    ) : audienceCount === -1 ? (
                      <span className="text-sm text-amber-600">Large audience (calculating...)</span>
                    ) : (
                      <span className="font-semibold text-slate-900">
                        {audienceCount.toLocaleString()} contacts
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Step 2: Send Options */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-base">Send Options</CardTitle>
                <CardDescription className="text-xs">When should this campaign be sent?</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={sendType}
              onValueChange={(v) => setSendType(v as "now" | "scheduled")}
              className="space-y-3"
            >
              {/* Send Now */}
              <div className={`flex items-start space-x-3 p-4 rounded-lg border ${sendType === "now" ? "border-green-200 bg-green-50" : "border-slate-200"}`}>
                <RadioGroupItem value="now" id="now" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="now" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <Send className="w-4 h-4 text-green-500" />
                    Send Now
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">Launch immediately after confirmation</p>
                </div>
              </div>
              
              {/* Schedule */}
              <div className={`flex items-start space-x-3 p-4 rounded-lg border ${sendType === "scheduled" ? "border-green-200 bg-green-50" : "border-slate-200"}`}>
                <RadioGroupItem value="scheduled" id="scheduled" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="scheduled" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <CalendarClock className="w-4 h-4 text-blue-500" />
                    Schedule
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">Send at a specific date and time</p>
                  
                  {sendType === "scheduled" && (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs text-slate-500">Date</Label>
                        <Input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="h-9 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Time</Label>
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="h-9 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Timezone</Label>
                        <Select value={timezone} onValueChange={setTimezone}>
                          <SelectTrigger className="h-9 text-sm mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern</SelectItem>
                            <SelectItem value="America/Chicago">Central</SelectItem>
                            <SelectItem value="America/Denver">Mountain</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                            <SelectItem value="Europe/London">London</SelectItem>
                            <SelectItem value="Europe/Paris">Paris</SelectItem>
                            <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </RadioGroup>

            <div className="pt-4 border-t mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-4 h-4 text-orange-500" />
                <Label className="text-sm font-medium">Throttling / Warm-up</Label>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-500 mb-2">
                    Limit sending speed to protect domain reputation. Leave empty for max speed.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="e.g. 50"
                      value={throttlingLimit || ""}
                      onChange={(e) => setThrottlingLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-32 h-9 text-sm"
                      min={1}
                    />
                    <span className="text-sm text-slate-600">emails per hour</span>
                  </div>
                  {throttlingLimit !== undefined && throttlingLimit < 10 && (
                    <div className="flex items-center gap-1 text-yellow-600 mt-1">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-xs">Low sending speed might impact performance.</span>
                    </div>
                  )}
                  {throttlingLimit !== undefined && throttlingLimit > 1000 && (
                    <div className="flex items-center gap-1 text-red-600 mt-1">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-xs">Limit cannot be higher than 1000/hr.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Step 3: Final Review */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-base">Final Review</CardTitle>
                <CardDescription className="text-xs">Confirm your campaign details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Campaign Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Campaign Name</Label>
                  <p className="text-sm font-medium text-slate-900 mt-1">{campaignIntent.campaignName}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Sender</Label>
                  <p className="text-sm font-medium text-slate-900 mt-1">{campaignIntent.senderName}</p>
                  <p className="text-xs text-slate-500">{campaignIntent.fromEmail}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg col-span-2">
                  <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Subject Line</Label>
                  <p className="text-sm font-medium text-slate-900 mt-1">{template.subject}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Audience</Label>
                  <p className="text-sm font-medium text-slate-900 mt-1">{audienceName}</p>
                  <p className="text-xs text-slate-500">{audienceCount.toLocaleString()} recipients</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Send Time</Label>
                  <p className="text-sm font-medium text-slate-900 mt-1">
                    {sendType === "now" ? "Immediately" : `${scheduledDate} at ${scheduledTime}`}
                  </p>
                  {sendType === "scheduled" && (
                    <p className="text-xs text-slate-500">{timezone}</p>
                  )}
                  {throttlingLimit && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <div className="flex items-center gap-1 text-orange-600">
                        <Gauge className="w-3 h-3" />
                        <span className="text-xs font-medium">Throttled: {throttlingLimit}/hr</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Template Preview Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowPreview(true)}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Email Template
              </Button>
              
              {/* Edit Template Link */}
              <div className="text-center">
                <Button variant="link" onClick={onEditTemplate} className="text-xs text-slate-500">
                  Edit template
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Launch CTA */}
        <div className="sticky bottom-0 bg-white border-t -mx-4 px-4 py-4 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              {!isValid && (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">
                    {audienceCount === 0 && "Select an audience"}
                    {sendType === "scheduled" && !scheduledDate && "Set a schedule date"}
                    {throttlingLimit !== undefined && throttlingLimit > 1000 && "Throttling limit too high"}
                  </span>
                </div>
              )}
              {isValid && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Ready to launch</span>
                </div>
              )}
            </div>
            
            <Button
              size="lg"
              disabled={!isValid || launching}
              onClick={handleLaunch}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8"
            >
              {launching ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5 mr-2" />
                  Launch Campaign
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Subject: {template.subject}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="bg-slate-100 p-4 rounded-lg">
              <div className="max-w-[600px] mx-auto bg-white rounded-lg shadow overflow-hidden">
                <iframe
                  title="Email Preview"
                  srcDoc={template.htmlContent}
                  className="w-full min-h-[400px] border-0"
                />
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AudienceSendPage;
