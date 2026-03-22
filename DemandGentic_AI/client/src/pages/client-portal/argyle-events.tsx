/**
 * Argyle Events — Client Portal Page
 * 
 * Shows upcoming Argyle events with draft campaign status.
 * Only visible when the argyle_event_drafts feature is enabled for the Argyle client.
 * 
 * Features:
 * - List upcoming events (title, date, type, location)
 * - Draft status (not created / draft ready / already ordered)
 * - "Create draft" or "Open draft" actions
 * - Inline draft editor with all fields + lead_count
 * - Submit draft as work order
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  MapPin,
  ExternalLink,
  FileEdit,
  Target,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Users,
  Send,
} from 'lucide-react';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';

const getToken = () => localStorage.getItem('clientPortalToken');

interface EventWithDraft {
  id: string;
  externalId: string;
  sourceUrl: string;
  title: string;
  community: string | null;
  eventType: string | null;
  location: string | null;
  startAtIso: string | null;
  startAtHuman: string | null;
  needsDateReview: boolean;
  lastSyncedAt: string;
  draftId: string | null;
  draftStatus: 'not_created' | 'draft' | 'pending_review' | 'rejected' | 'approved';
  draftLeadCount: number | null;
  draftHasEdits: boolean;
  draftWorkOrderId: string | null;
  draftUpdatedAt: string | null;
  draftRejectionReason: string | null;
}



interface DraftDetail {
  event: EventWithDraft;
  draft: {
    id: string;
    status: string;
    leadCount: number | null;
    draftFields: Record;
    sourceFields: Record | null;
  } | null;
}

function StatusBadge({ status }: { status: string }) {
  // Deprecated - replaced by inline badges in new design
  return null;
}

function EventTypeBadge({ type }: { type: string | null }) {
  // Deprecated - replaced by inline badges in new design
  return null;
}

export default function ArgyleEventsPage() {
  return (
    
      
    
  );
}

/**
 * Embeddable content component — can be rendered inside the dashboard tab
 * or as a standalone page. No layout wrapper.
 */
export function ArgyleEventsContent() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hasSynced, setHasSynced] = useState(false);

  // Check feature status
  const { data: featureStatus } = useQuery({
    queryKey: ['argyle-events-feature-status'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/argyle-events/feature-status', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return { enabled: false, reason: 'error' };
      return res.json();
    },
  });

  // List events
  const { data: eventsData, isLoading: eventsLoading, isFetched: eventsFetched } = useQuery({
    queryKey: ['argyle-events'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/argyle-events/events', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
    enabled: featureStatus?.enabled === true,
  });

  // Sync mutation — client can trigger a sync to scrape events from argyleforum.com
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/argyle-events/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      setHasSynced(true);
      toast({
        title: 'Events synced',
        description: `Found ${data.eventsFound} events. ${data.eventsCreated} new, ${data.eventsUpdated} updated.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
    },
  });

  // Auto-sync on first load if no events exist yet
  useEffect(() => {
    if (
      featureStatus?.enabled &&
      eventsFetched &&
      !eventsLoading &&
      (!eventsData || eventsData.events.length === 0) &&
      !hasSynced &&
      !syncMutation.isPending
    ) {
      setHasSynced(true);
      syncMutation.mutate();
    }
  }, [featureStatus, eventsFetched, eventsLoading, eventsData, hasSynced]);

  // Draft editor state
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState(null);

  // Fetch draft detail when a draft is selected
  const { data: draftData, isLoading: draftLoading } = useQuery({
    queryKey: ['argyle-draft', selectedDraftId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/argyle-events/drafts/${selectedDraftId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch draft');
      return res.json();
    },
    enabled: !!selectedDraftId,
  });

  // Access draft mutation (idempotent: opens existing or creates once)
  const accessDraftMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/client-portal/argyle-events/events/${eventId}/draft`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to create draft');
      return res.json();
    },
    onSuccess: (data, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      const draftId = data.draftId || data.id;
      const params = new URLSearchParams({
        argyleFlow: '1',
        argyleEventId: eventId,
        argyleDraftId: String(draftId),
      });
      navigate(`/client-portal/create-campaign?${params.toString()}`);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create draft', description: error.message, variant: 'destructive' });
    },
  });

  // Update draft mutation
  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, draftFields, leadCount }: { id: string; draftFields: Record; leadCount: number }) => {
      const res = await fetch(`/api/client-portal/argyle-events/drafts/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftFields, leadCount }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update draft');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['argyle-draft', selectedDraftId] });
      toast({ title: 'Draft saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  // Submit draft as work order
  const submitDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/client-portal/argyle-events/drafts/${draftId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      queryClient.invalidateQueries({ queryKey: ['argyle-draft', selectedDraftId] });
      toast({ title: 'Submitted for review', description: 'Your request is pending admin review.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
    },
  });




  if (featureStatus && !featureStatus.enabled) {
    return (
      
        This feature is not available for your account.
      
    );
  }

  const events = eventsData?.events || [];
  const upcomingEvents = events.filter(e => {
    if (!e.startAtIso) return true; // Show events without parsed dates
    return new Date(e.startAtIso) >= new Date();
  });

  return (
    <>
      
        {/* Hero Header */}
        
          
          
          
            
              
              {upcomingEvents.length} Upcoming Events Found
            
            
              Event Intelligence
            
            
              Transform upcoming industry events into targeted lead generation campaigns.
              Select an event, define your lead volume, and launch an outreach campaign in seconds.
            
            
               syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? 'Syncing Calendar...' : 'Refresh Event List'}
              
            
          
        

        {/* Content */}
        {(eventsLoading || syncMutation.isPending) ? (
          
            {[1, 2, 3, 4, 5, 6].map(i => (
              
            ))}
          
        ) : upcomingEvents.length === 0 ? (
          
            
              
            
            No Upcoming Events
            
              We couldn't find any upcoming events matching your criteria. Check back later for updates.
            
             syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              Sync Events Now
            
          
        ) : (
          
            {upcomingEvents.map((event) => {
              // Determine gradient based on community/type
              const getCommunityGradient = (c: string | null) => {
                const comm = c?.toLowerCase() || '';
                if (comm.includes('finance') || comm.includes('cfo')) return 'from-blue-600 to-indigo-600';
                if (comm.includes('hr') || comm.includes('human') || comm.includes('chrc')) return 'from-fuchsia-600 to-rose-600';
                if (comm.includes('marketing') || comm.includes('cmo') || comm.includes('cx')) return 'from-orange-500 to-pink-600';
                if (comm.includes('security') || comm.includes('ciso')) return 'from-emerald-600 to-teal-600';
                return 'from-slate-700 to-slate-900';
              };
              
              const gradient = getCommunityGradient(event.community);
              const isDraftReady = event.draftStatus !== 'not_created';

              return (
                
                  {/* Card Header Image/Gradient */}
                  
                    
                      
                    
                    
                      {event.community || 'General'}
                    
                    {isDraftReady && (
                       
                        {event.draftStatus === 'approved'
                          ? 'Ordered'
                          : event.draftStatus === 'pending_review'
                            ? 'Pending'
                          : event.draftStatus === 'rejected'
                            ? 'Rejected'
                            : 'Draft Ready'}
                      
                    )}
                  

                  
                    
                      
                         window.open(event.sourceUrl, '_blank')}
                        >
                          {event.title}
                        
                        {event.eventType && (
                          
                            {event.eventType}
                          
                        )}
                      

                      
                         
                           
                           {event.startAtHuman || 'Date TBD'}
                         
                         
                           
                           {event.location || 'Location TBD'}
                         
                      
                    

                    
                       {event.draftStatus === 'not_created' ? (
                           accessDraftMutation.mutate(event.id)}
                            disabled={accessDraftMutation.isPending}
                          >
                            {accessDraftMutation.isPending ? (
                              
                            ) : (
                              
                            )}
                            Access Campaign Draft
                          
                       ) : event.draftStatus === 'approved' ? (
                          
                             
                             Campaign Ordered
                          
                       ) : event.draftStatus === 'pending_review' ? (
                          
                             
                             Pending Review
                          
                       ) : (
                          
                            {event.draftStatus === 'rejected' && event.draftRejectionReason && (
                              
                                Rejected: {event.draftRejectionReason}
                              
                            )}
                             accessDraftMutation.mutate(event.id)}
                            >
                              
                              {event.draftStatus === 'rejected' ? 'Edit & Resubmit' : 'Access Campaign Draft'}
                            
                          
                       )}
                    
                  
                
              );
            })}
          
        )}
      

      {/* Landing Page Modal */}
       {
          setShowDraftDialog(open);
          if (!open) setSelectedDraftId(null);
        }}
        draftData={draftData || null}
        isLoading={draftLoading}
        onSave={(fields, leadCount) => {
          if (selectedDraftId) {
            updateDraftMutation.mutate({ id: selectedDraftId, draftFields: fields, leadCount });
          }
        }}
        onSaveAndSubmit={async (fields, leadCount) => {
          if (!selectedDraftId) return;
          // Save first, then submit after save completes
          await updateDraftMutation.mutateAsync({ id: selectedDraftId, draftFields: fields, leadCount });
          await submitDraftMutation.mutateAsync(selectedDraftId);
        }}
        isSaving={updateDraftMutation.isPending}
        isSubmitting={submitDraftMutation.isPending}
      />
    
  );
}

// ==================== Landing Page / Draft Editor Dialog ====================

interface DraftEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftData: DraftDetail | null;
  isLoading: boolean;
  onSave: (fields: Record, leadCount: number) => void;
  onSaveAndSubmit: (fields: Record, leadCount: number) => Promise;
  isSaving: boolean;
  isSubmitting: boolean;
}

function DraftEditorDialog({
  open,
  onOpenChange,
  draftData,
  isLoading,
  onSave,
  onSaveAndSubmit,
  isSaving,
  isSubmitting,
}: DraftEditorDialogProps) {
  const [localFields, setLocalFields] = useState>({});
  const [localLeadCount, setLocalLeadCount] = useState('');
  const [dirty, setDirty] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  // Initialize local state when draft data loads
  useEffect(() => {
    if (draftData?.draft) {
      setLocalFields(draftData.draft.draftFields || {});
      setLocalLeadCount(draftData.draft.leadCount?.toString() || '');
      setDirty(false);
    }
  }, [draftData]);

  const updateField = (key: string, value: any) => {
    setLocalFields(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    const leadCount = parseInt(localLeadCount, 10);
    onSave(localFields, isNaN(leadCount) ? 0 : leadCount);
    setDirty(false);
  };

  const isSubmitted = draftData?.draft?.status === 'submitted';
  const canSubmit = !isSubmitted && localLeadCount && parseInt(localLeadCount, 10) > 0;
  
  // Helper for gradients
  const getCommunityGradient = (c: string | null) => {
    const comm = c?.toLowerCase() || '';
    if (comm.includes('finance')) return 'from-blue-600 to-indigo-600';
    if (comm.includes('hr') || comm.includes('human')) return 'from-fuchsia-600 to-rose-600';
    if (comm.includes('marketing')) return 'from-orange-500 to-pink-600';
    return 'from-slate-700 to-slate-900';
  };
  
  if (!draftData && isLoading) return null; // Or loader

  return (
    
      
        Event Draft Editor
        
           
           {/* Left Column: Event "Poster" */}
           
             
             
             
             
                
                  
                     {draftData?.event?.community || 'Event'}
                  
                  
                    {draftData?.event?.title}
                  
                

                
                   
                      
                        
                      
                      
                        Date
                        {localFields.eventDate || draftData?.event?.startAtHuman || 'TBD'}
                      
                   
                   
                   
                      
                        
                      
                      
                        Location
                        {localFields.eventLocation || draftData?.event?.location || 'TBD'}
                      
                   
                   
                   
                      
                        "{localFields.context || 'Join top industry leaders at this premier event. Leverage our AI agents to engage attendees and drive qualified meetings.'}"
                      
                   
                
             
             
             
               
                  
                  View Original Event Page
                
             
           

           {/* Right Column: Campaign Strategy */}
           
              
                 
                   Campaign Strategy
                   Configure your outreach campaign for this event.
                 
                 
                   {isSubmitted && Order Submitted}
                    onOpenChange(false)}>
                      Close
                      
                        
                        
                      
                    
                 
              

              {isLoading ? (
                 
                   
                 
              ) : (
                
                  {/* Lead Count - Hero Input */}
                  
                     
                        
                        Target Lead Volume
                     
                     
                        How many prospects do you want to target from this event's audience?
                     
                     
                         { setLocalLeadCount(e.target.value); setDirty(true); }}
                          placeholder="e.g. 500"
                          className="text-2xl h-14 w-40 font-bold text-center bg-background shadow-inner"
                          disabled={isSubmitted}
                        />
                        
                           { setLocalLeadCount(e.target.value); setDirty(true); }}
                            className="w-full accent-indigo-600 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                            disabled={isSubmitted}
                          />
                          
                             100
                             2.5k
                             5k+
                          
                        
                     
                  

                  
                  
                  
                     
                       
                       Strategy Details
                     
                     
                     
                        
                           Objective
                            updateField('objective', e.target.value)}
                              rows={2}
                              className="resize-none focus-visible:ring-indigo-500"
                              placeholder="e.g. Book meetings with VP level attendees..."
                              disabled={isSubmitted}
                           />
                        
                        
                           Targeting Criteria
                            updateField('targetingNotes', e.target.value)}
                              rows={2}
                              className="resize-none focus-visible:ring-indigo-500"
                              placeholder="Specific titles, companies, or attendee types..."
                              disabled={isSubmitted}
                           />
                        
                     
                  
                
              )}

              
                 {!isSubmitted && (
                   <>
                     
                       {isSaving ? 'Saving...' : 'Save Draft'}
                     
                      {
                          const leadCount = parseInt(localLeadCount, 10);
                          if (isNaN(leadCount) || leadCount 
                       {(isSubmitting || isLaunching) ? (
                          
                       ) : (
                          
                       )}
                       Launch Campaign
                     
                   
                 )}
                 {isSubmitted && (
                     onOpenChange(false)}>
                       Close Window
                    
                 )}
              
           
        
      
    
  );
}