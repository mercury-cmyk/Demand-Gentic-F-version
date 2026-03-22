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
  Building2,
  CalendarClock,
  SlidersHorizontal,
  Lock,
  Gauge
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";
import { cn } from "@/lib/utils";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import type { FilterGroup } from "@shared/filter-types";

interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  preheader?: string;
  campaignProviderId?: string | null;
  campaignProviderName?: string | null;
  campaignProviderKey?: string | null;
  domainAuthId?: number | null;
  domainName?: string | null;
  // Project & org context carried from Step 1
  clientAccountId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  campaignOrganizationId?: string;
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

interface ClientAccount {
  id: string;
  name: string;
}

interface ClientProject {
  id: string;
  name: string;
  status: string;
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
  clientAccountId: string;
  projectId: string;
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
  const [audienceType, setAudienceType] = useState("segment");
  const [selectedSegment, setSelectedSegment] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [filterGroup, setFilterGroup] = useState(undefined);
  const [appliedFilterGroup, setAppliedFilterGroup] = useState(undefined);
  const [segments, setSegments] = useState([]);
  const [lists, setLists] = useState([]);
  const [loadingAudience, setLoadingAudience] = useState(true);
  const [audienceCount, setAudienceCount] = useState(0);
  const [countingAudience, setCountingAudience] = useState(false);

  // Client/project linkage - pre-populated from Step 1
  const [clientAccounts, setClientAccounts] = useState([]);
  const [clientProjects, setClientProjects] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(campaignIntent.clientAccountId || "");
  const [selectedProjectId, setSelectedProjectId] = useState(campaignIntent.projectId || "");
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  
  // Send options state
  const [sendType, setSendType] = useState("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [throttlingLimit, setThrottlingLimit] = useState(undefined);
  
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

  // Fetch client accounts
  useEffect(() => {
    let active = true;
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const res = await apiRequest("GET", "/api/client-portal/admin/clients");
        if (!res.ok) throw new Error("Failed to load clients");
        const data = await res.json();
        if (active) {
          setClientAccounts(data || []);
        }
      } catch (error) {
        console.error("Failed to load clients:", error);
        if (active) setClientAccounts([]);
      } finally {
        if (active) setLoadingClients(false);
      }
    };
    fetchClients();
    return () => {
      active = false;
    };
  }, []);

  // Fetch projects for selected client
  useEffect(() => {
    let active = true;
    const fetchProjects = async () => {
      if (!selectedClientId) {
        setClientProjects([]);
        setSelectedProjectId("");
        return;
      }
      setLoadingProjects(true);
      try {
        const res = await apiRequest("GET", `/api/client-portal/admin/clients/${selectedClientId}`);
        if (!res.ok) throw new Error("Failed to load projects");
        const data = await res.json();
        if (active) {
          const projects = data?.projects || [];
          setClientProjects(projects);
          if (projects.length > 0) {
            // Keep pre-populated projectId if valid, otherwise pick first
            setSelectedProjectId((prev) =>
              prev && projects.some((p: ClientProject) => p.id === prev) ? prev : projects[0].id
            );
          } else {
            setSelectedProjectId("");
          }
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
        if (active) {
          setClientProjects([]);
          setSelectedProjectId("");
        }
      } finally {
        if (active) setLoadingProjects(false);
      }
    };
    fetchProjects();
    return () => {
      active = false;
    };
  }, [selectedClientId]);
  
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
    if (!selectedClientId || !selectedProjectId) return false;
    if (audienceType === "segment" && !selectedSegment) return false;
    if (audienceType === "list" && !selectedList) return false;
    if (audienceType === "filters" && (!appliedFilterGroup || (appliedFilterGroup.conditions?.length ?? 0) === 0)) return false;
    if (sendType === "scheduled" && (!scheduledDate || !scheduledTime)) return false;
    if (throttlingLimit !== undefined && throttlingLimit > 1000) return false;
    // Allow -1 (large audience estimate) or any positive count
    return audienceCount > 0 || audienceCount === -1;
  }, [selectedClientId, selectedProjectId, audienceType, selectedSegment, selectedList, appliedFilterGroup, sendType, scheduledDate, scheduledTime, audienceCount, throttlingLimit]);
  
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

  const launchReadiness = useMemo(() => {
    const senderReady = Boolean(campaignIntent.senderProfileId && campaignIntent.fromEmail);
    const routingReady = Boolean(campaignIntent.campaignProviderName || campaignIntent.campaignProviderKey || campaignIntent.senderProfileId);
    const complianceReady = Boolean(campaignIntent.replyToEmail);
    const trackingReady = Boolean(template.subject && template.htmlContent);
    return { senderReady, routingReady, complianceReady, trackingReady };
  }, [campaignIntent, template]);
  
  // Handle launch
  const handleLaunch = async () => {
    if (!isValid) return;
    
    setLaunching(true);
    try {
      await onLaunch({
        clientAccountId: selectedClientId,
        projectId: selectedProjectId,
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
    
      {/* Top Bar */}
      
        
          
            
              
              Back
            
            
            
              {campaignIntent.campaignName}
              Select audience and launch
            
          
          
          
            Step 3 of 3
          
        
      
      
      
        
          
            
              
                
                  Provider Route
                  
                    {campaignIntent.campaignProviderName || campaignIntent.campaignProviderKey || "Default routing"}
                  
                  {campaignIntent.domainName || "Sender-linked domain"}
                
                
                  Sender Envelope
                  {campaignIntent.senderName}
                  {campaignIntent.fromEmail}
                  Reply-to: {campaignIntent.replyToEmail}
                
                
                  Message Setup
                  {template.subject}
                  {campaignIntent.preheader || template.preheader || "No preview text"}
                
              

              
                Activation Readiness
                
                  {[
                    { label: "Sender and route", ready: launchReadiness.senderReady && launchReadiness.routingReady },
                    { label: "Reply and compliance", ready: launchReadiness.complianceReady },
                    { label: "Tracking and reports", ready: launchReadiness.trackingReady },
                  ].map((item) => (
                    
                      {item.label}
                      
                        {item.ready ? "ready" : "review"}
                      
                    
                  ))}
                
              
            
          
        

        {/* Step 0: Client & Project */}
        
          
            
              
                
              
              
                Client & Project
                
                  {campaignIntent.clientAccountId
                    ? "Pre-filled from campaign setup — change if needed"
                    : "Link this campaign to a client and project"}
                
              
            
          
          
            
              
                Client
                {loadingClients ? (
                  
                    
                    Loading clients...
                  
                ) : (
                  
                    
                      
                    
                    
                      {clientAccounts.length === 0 ? (
                        No clients found
                      ) : (
                        clientAccounts.map((client) => (
                          
                            {client.name}
                          
                        ))
                      )}
                    
                  
                )}
              

              
                Project
                {!selectedClientId ? (
                  Select a client first
                ) : loadingProjects ? (
                  
                    
                    Loading projects...
                  
                ) : (
                  
                    
                      
                    
                    
                      {clientProjects.length === 0 ? (
                        No projects found
                      ) : (
                        clientProjects.map((project) => (
                          
                            {project.name} ({project.status})
                          
                        ))
                      )}
                    
                  
                )}
              
            
          
        

        {/* Step 1: Select Audience */}
        
          
            
              
                
              
              
                Select Audience
                Choose who will receive this campaign
              
            
          
          
            {loadingAudience ? (
              
                
              
            ) : (
              <>
                 setAudienceType(v as "segment" | "list" | "filters" | "all")}
                  className="space-y-3"
                >
                  {/* Segment Option */}
                  
                    
                    
                      
                        
                        Segment
                      
                      Dynamic audience based on filters
                      
                      {audienceType === "segment" && (
                        
                          
                            
                              
                            
                            
                              {segments.length === 0 ? (
                                No segments found
                              ) : (
                                segments.map((segment) => (
                                  
                                    
                                      {segment.name}
                                      {segment.contactCount !== undefined && (
                                        {segment.contactCount.toLocaleString()} contacts
                                      )}
                                    
                                  
                                ))
                              )}
                            
                          
                        
                      )}
                    
                  
                  
                  {/* List Option */}
                  
                    
                    
                      
                        
                        List
                      
                      Static list of contacts
                      
                      {audienceType === "list" && (
                        
                          
                            
                              
                            
                            
                              {lists.length === 0 ? (
                                No lists found
                              ) : (
                                lists.map((list) => (
                                  
                                    
                                      {list.name}
                                      {list.contactCount !== undefined && (
                                        {list.contactCount.toLocaleString()} contacts
                                      )}
                                    
                                  
                                ))
                              )}
                            
                          
                        
                      )}
                    
                  
                  
                  {/* All Contacts Option */}
                  
                    
                    
                      
                        
                        All Contacts
                      
                      Send to entire contact database
                    
                  
                  
                  {/* Advanced Filters Option */}
                  
                    
                    
                      
                        
                        Advanced Filters
                      
                      Build custom filter criteria
                      
                      {audienceType === "filters" && (
                        
                           {
                              console.log('[AudienceSendPage] onApplyFilter called with:', JSON.stringify(applied, null, 2));
                              setFilterGroup(applied || { logic: "AND", conditions: [] });
                              setAppliedFilterGroup(applied);
                            }}
                            initialFilter={filterGroup}
                            embedded={true}
                          />
                          {appliedFilterGroup && (appliedFilterGroup.conditions?.length ?? 0) > 0 && (
                            
                              
                              Filters applied - {appliedFilterGroup.conditions?.length} condition(s)
                            
                          )}
                        
                      )}
                    
                  
                
                
                {/* Audience Count */}
                
                  Selected audience:
                  
                    {countingAudience ? (
                      <>
                        
                        Counting...
                      
                    ) : audienceCount === -1 ? (
                      Large audience (calculating...)
                    ) : (
                      
                        {audienceCount.toLocaleString()} contacts
                      
                    )}
                  
                
              
            )}
          
        
        
        {/* Step 2: Send Options */}
        
          
            
              
                
              
              
                Send Options
                When should this campaign be sent?
              
            
          
          
             setSendType(v as "now" | "scheduled")}
              className="space-y-3"
            >
              {/* Send Now */}
              
                
                
                  
                    
                    Send Now
                  
                  Launch immediately after confirmation
                
              
              
              {/* Schedule */}
              
                
                
                  
                    
                    Schedule
                  
                  Send at a specific date and time
                  
                  {sendType === "scheduled" && (
                    
                      
                        Date
                         setScheduledDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="h-9 text-sm mt-1"
                        />
                      
                      
                        Time
                         setScheduledTime(e.target.value)}
                          className="h-9 text-sm mt-1"
                        />
                      
                      
                        Timezone
                        
                          
                            
                          
                          
                            Eastern
                            Central
                            Mountain
                            Pacific
                            London
                            Paris
                            Tokyo
                          
                        
                      
                    
                  )}
                
              
            

            
              
                
                Throttling / Warm-up
              
              
                
                  
                    Limit sending speed to protect domain reputation. Leave empty for max speed.
                  
                  
                     setThrottlingLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-32 h-9 text-sm"
                      min={1}
                    />
                    emails per hour
                  
                  {throttlingLimit !== undefined && throttlingLimit 
                      
                      Low sending speed might impact performance.
                    
                  )}
                  {throttlingLimit !== undefined && throttlingLimit > 1000 && (
                    
                      
                      Limit cannot be higher than 1000/hr.
                    
                  )}
                
              
            
          
        
        
        {/* Step 3: Final Review */}
        
          
            
              
                
              
              
                Final Review
                Confirm your campaign details
              
            
          
          
            
              {/* Campaign Details Grid */}
              
                
                  Campaign Name
                  {campaignIntent.campaignName}
                
                
                  Sender
                  {campaignIntent.senderName}
                  {campaignIntent.fromEmail}
                
                
                  Subject Line
                  {template.subject}
                
                
                  Audience
                  {audienceName}
                  {audienceCount.toLocaleString()} recipients
                
                
                  Send Time
                  
                    {sendType === "now" ? "Immediately" : `${scheduledDate} at ${scheduledTime}`}
                  
                  {sendType === "scheduled" && (
                    {timezone}
                  )}
                  {throttlingLimit && (
                    
                      
                        
                        Throttled: {throttlingLimit}/hr
                      
                    
                  )}
                
                
                  Provider Route
                  
                    {campaignIntent.campaignProviderName || campaignIntent.campaignProviderKey || "Default routing"}
                  
                  {campaignIntent.domainName || "Sender-linked domain"}
                
                
                  Reply + Preview
                  {campaignIntent.replyToEmail}
                  {campaignIntent.preheader || template.preheader || "No preview text"}
                
              

              
                
                  Tracking and Reporting
                  
                    Launch feeds open, click, unsubscribe, and recipient activity into campaign reporting. Link performance and engagement tabs stay aligned to the send pipeline.
                  
                
                
                  Compliance and Suppression
                  
                    Unsubscribe controls, blacklist checks, and audience suppression logic remain enforced at send time. Reply-to and sender identity are already locked into the route.
                  
                
                
                  Landing Page Readiness
                  
                    CTA links built in the template step can carry merge-tag prefill values so registrations and follow-on forms open with known contact data already attached.
                  
                
              
              
              {/* Template Preview Button */}
               setShowPreview(true)}
              >
                
                Preview Email Template
              
              
              {/* Edit Template Link */}
              
                
                  Edit template
                
              
            
          
        
        
        {/* Launch CTA */}
        
          
            
              {!isValid && (
                
                  
                  
                    {!selectedClientId && "Select a client"}
                    {selectedClientId && !selectedProjectId && "Select a project"}
                    {audienceCount === 0 && "Select an audience"}
                    {sendType === "scheduled" && !scheduledDate && "Set a schedule date"}
                    {throttlingLimit !== undefined && throttlingLimit > 1000 && "Throttling limit too high"}
                  
                
              )}
              {isValid && (
                
                  
                  Ready to launch with tracking, suppression, and route controls in place
                
              )}
            
            
            
              {launching ? (
                <>
                  
                  Launching...
                
              ) : (
                <>
                  
                  Launch Campaign
                
              )}
            
          
        
      
      
      {/* Preview Modal */}
      
        
          
            Email Preview
            
              Subject: {template.subject}
            
          
          
            
              
                
              
            
          
        
      
    
  );
}

export default AudienceSendPage;