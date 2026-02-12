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
import { WorkOrderForm } from '@/components/client-portal/work-orders/work-order-form';
import { useDirectAgenticOrderModal } from '@/hooks/use-direct-agentic-order-modal';

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
  draftStatus: 'not_created' | 'draft' | 'ready' | 'submitted' | 'cancelled';
  draftLeadCount: number | null;
  draftHasEdits: boolean;
  draftWorkOrderId: string | null;
  draftUpdatedAt: string | null;
}



interface DraftDetail {
  event: EventWithDraft;
  draft: {
    id: string;
    status: string;
    leadCount: number | null;
    draftFields: Record<string, any>;
    sourceFields: Record<string, any> | null;
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
    <ClientPortalLayout>
      <ArgyleEventsContent />
    </ClientPortalLayout>
  );
}

/**
 * Embeddable content component — can be rendered inside the dashboard tab
 * or as a standalone page. No layout wrapper.
 */
export function ArgyleEventsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hasSynced, setHasSynced] = useState(false);

  // Shared Direct Agentic Order modal (same form as Work Orders tab)
  const { openModal, modalProps } = useDirectAgenticOrderModal();

  // Check feature status
  const { data: featureStatus } = useQuery<{ enabled: boolean; reason?: string }>({
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
  const { data: eventsData, isLoading: eventsLoading, isFetched: eventsFetched } = useQuery<{
    events: EventWithDraft[];
    total: number;
  }>({
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
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // Fetch draft detail when a draft is selected
  const { data: draftData, isLoading: draftLoading } = useQuery<DraftDetail>({
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

  // Create draft mutation
  const createDraftMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/client-portal/argyle-events/events/${eventId}/draft`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to create draft');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      setSelectedDraftId(data.draftId || data.id);
      setShowDraftDialog(true);
      toast({ title: 'Draft created', description: 'Campaign draft initialized.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create draft', description: error.message, variant: 'destructive' });
    },
  });

  // Update draft mutation
  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, draftFields, leadCount }: { id: string; draftFields: Record<string, any>; leadCount: number }) => {
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
      toast({ title: 'Campaign ordered', description: 'Your work order has been submitted.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
    },
  });




  // Use unified work order form for all event interactions
  const handleEventAction = (event: any, mode: 'create' | 'edit' = 'create') => {
    const eventContext = {
      externalEventId: event.id,
      eventTitle: event.title,
      eventDate: event.startAtHuman || event.startAtIso || '',
      eventType: event.eventType || 'event',
      eventLocation: event.location || '',
      eventCommunity: event.community || '',
      eventSourceUrl: event.sourceUrl || '',
      leadCount: event.draftLeadCount || undefined,
    };

    const initialValues = mode === 'edit' && event.draftId ? {
      title: event.title,
      description: `Generate qualified leads for ${event.title}`,
      targetLeadCount: event.draftLeadCount || undefined,
      targetRegions: event.location ? [event.location] : [],
      eventSource: 'argyle_event',
      externalEventId: event.id,
      eventSourceUrl: event.sourceUrl,
    } : undefined;

    openModal({
      eventContext,
      initialValues,
    });
  };

  if (featureStatus && !featureStatus.enabled) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground">This feature is not available for your account.</p>
      </div>
    );
  }

  const events = eventsData?.events || [];
  const upcomingEvents = events.filter(e => {
    if (!e.startAtIso) return true; // Show events without parsed dates
    return new Date(e.startAtIso) >= new Date();
  });

  return (
    <>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 px-8 py-12 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 to-slate-900/90"></div>
          <div className="relative z-10 max-w-2xl space-y-4">
            <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-none mb-2">
              <RefreshCw className={`h-3 w-3 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {upcomingEvents.length} Upcoming Events Found
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
              Event Intelligence
            </h1>
            <p className="text-lg text-indigo-100/80 leading-relaxed">
              Transform upcoming industry events into targeted lead generation campaigns.
              Select an event, define your lead volume, and launch an outreach campaign in seconds.
            </p>
            <div className="pt-2">
              <Button
                size="sm"
                className="bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? 'Syncing Calendar...' : 'Refresh Event List'}
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        {(eventsLoading || syncMutation.isPending) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 rounded-xl bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div className="text-center py-24 rounded-xl border-2 border-dashed border-muted">
            <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No Upcoming Events</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              We couldn't find any upcoming events matching your criteria. Check back later for updates.
            </p>
            <Button
              className="mt-6"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              Sync Events Now
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <div 
                  key={event.id} 
                  className="group relative flex flex-col rounded-xl border bg-card shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden"
                >
                  {/* Card Header Image/Gradient */}
                  <div className={`h-32 bg-gradient-to-br ${gradient} p-6 relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                      <Users className="w-24 h-24 rotate-12 -mr-8 -mt-8 text-white" />
                    </div>
                    <Badge className="absolute top-4 left-4 bg-black/40 text-white backdrop-blur-md border-none font-medium">
                      {event.community || 'General'}
                    </Badge>
                    {isDraftReady && (
                       <Badge variant="secondary" className="absolute top-4 right-4 shadow-lg bg-white/90 text-foreground backdrop-blur-md">
                        {event.draftStatus === 'submitted' ? 'Ordered' : 'Draft Ready'}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-col flex-1 p-6">
                    <div className="flex-1 space-y-4">
                      <div>
                        <h3 
                          className="font-bold text-xl leading-tight line-clamp-2 group-hover:text-primary transition-colors cursor-pointer"
                          onClick={() => window.open(event.sourceUrl, '_blank')}
                        >
                          {event.title}
                        </h3>
                        {event.eventType && (
                          <p className="text-sm font-medium text-muted-foreground mt-1 uppercase tracking-wider">
                            {event.eventType}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-muted-foreground">
                         <div className="flex items-center gap-2">
                           <Calendar className="h-4 w-4 text-primary/70" />
                           <span className="font-medium text-foreground">{event.startAtHuman || 'Date TBD'}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <MapPin className="h-4 w-4 text-primary/70" />
                           <span className="line-clamp-1">{event.location || 'Location TBD'}</span>
                         </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t flex items-center justify-between gap-3">
                       {event.draftStatus === 'not_created' ? (
                          <Button
                            className="w-full bg-primary/5 text-primary hover:bg-primary/10 border-primary/20 shadow-none hover:shadow-sm"
                            variant="outline"
                            onClick={() => createDraftMutation.mutate(event.id)}
                            disabled={createDraftMutation.isPending}
                          >
                            {createDraftMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Target className="h-4 w-4 mr-2" />
                            )}
                            Initialize Campaign
                          </Button>
                       ) : event.draftStatus === 'submitted' ? (
                          <Button className="w-full bg-green-50 text-green-700 border-green-200 hover:bg-green-100" variant="outline" disabled>
                             <CheckCircle2 className="h-4 w-4 mr-2" />
                             Campaign Ordered
                          </Button>
                       ) : (
                          <Button
                            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md hover:shadow-lg transition-all border-0"
                            onClick={() => {
                              setSelectedDraftId(event.draftId);
                              setShowDraftDialog(true);
                            }}
                          >
                            <Target className="h-4 w-4 mr-2" />
                            {event.draftLeadCount ? `Ordered (${event.draftLeadCount})` : 'Access Campaign Draft'}
                          </Button>
                       )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Landing Page Modal */}
      <DraftEditorDialog
        open={showDraftDialog}
        onOpenChange={(open) => {
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

      {/* Shared Direct Agentic Order Modal */}
      <WorkOrderForm {...modalProps} />
    </>
  );
}

// ==================== Landing Page / Draft Editor Dialog ====================

interface DraftEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftData: DraftDetail | null;
  isLoading: boolean;
  onSave: (fields: Record<string, any>, leadCount: number) => void;
  onSaveAndSubmit: (fields: Record<string, any>, leadCount: number) => Promise<void>;
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
  const [localFields, setLocalFields] = useState<Record<string, any>>({});
  const [localLeadCount, setLocalLeadCount] = useState<string>('');
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0 gap-0 border-0 bg-card shadow-2xl rounded-2xl flex flex-col" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Event Draft Editor</DialogTitle>
        <div className="flex flex-col lg:flex-row h-full overflow-hidden">
           
           {/* Left Column: Event "Poster" */}
           <div className={`relative lg:w-2/5 p-8 text-white flex flex-col justify-between overflow-hidden bg-slate-900 shrink-0`}>
             <div className={`absolute inset-0 bg-gradient-to-br ${getCommunityGradient(draftData?.event?.community || '')} opacity-90`}></div>
             <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-20"></div>
             
             <div className="relative z-10 space-y-6">
                <div>
                  <Badge className="bg-white/20 hover:bg-white/30 text-white border-none backdrop-blur-sm mb-4">
                     {draftData?.event?.community || 'Event'}
                  </Badge>
                  <h2 className="text-3xl font-extrabold leading-tight text-white drop-shadow-sm">
                    {draftData?.event?.title}
                  </h2>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-3 text-white/90">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-white/60 font-medium uppercase tracking-wider">Date</p>
                        <p className="font-semibold">{localFields.eventDate || draftData?.event?.startAtHuman || 'TBD'}</p>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-3 text-white/90">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-white/60 font-medium uppercase tracking-wider">Location</p>
                        <p className="font-semibold line-clamp-2">{localFields.eventLocation || draftData?.event?.location || 'TBD'}</p>
                      </div>
                   </div>
                   
                   <div className="pt-4 mt-4 border-t border-white/10">
                      <p className="text-white/80 italic text-sm leading-relaxed">
                        "{localFields.context || 'Join top industry leaders at this premier event. Leverage our AI agents to engage attendees and drive qualified meetings.'}"
                      </p>
                   </div>
                </div>
             </div>
             
             <div className="relative z-10 mt-8">
               <a
                  href={draftData?.event?.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-white/70 hover:text-white transition-colors"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Original Event Page
                </a>
             </div>
           </div>

           {/* Right Column: Campaign Strategy */}
           <div className="lg:w-3/5 p-8 flex flex-col bg-card overflow-hidden">
              <div className="flex items-center justify-between mb-6 shrink-0">
                 <div>
                   <h3 className="text-2xl font-bold text-foreground">Campaign Strategy</h3>
                   <p className="text-sm text-muted-foreground">Configure your outreach campaign for this event.</p>
                 </div>
                 <div className="flex items-center gap-2">
                   {isSubmitted && <Badge className="bg-green-100 text-green-800 border-green-200">Order Submitted</Badge>}
                   <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                      <span className="sr-only">Close</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </Button>
                 </div>
              </div>

              {isLoading ? (
                 <div className="flex-1 flex items-center justify-center">
                   <Loader2 className="h-12 w-12 animate-spin text-muted-foreground/30" />
                 </div>
              ) : (
                <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                  {/* Lead Count - Hero Input */}
                  <div className="bg-gradient-to-r from-indigo-50 to-slate-50 dark:from-indigo-950/30 dark:to-slate-900/30 p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/50 shadow-sm">
                     <Label className="text-lg font-semibold flex items-center gap-2 mb-3 text-foreground">
                        <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        Target Lead Volume
                     </Label>
                     <p className="text-sm text-muted-foreground mb-4">
                        How many prospects do you want to target from this event's audience?
                     </p>
                     <div className="flex items-center gap-4">
                        <Input 
                          type="number" 
                          value={localLeadCount}
                          onChange={(e) => { setLocalLeadCount(e.target.value); setDirty(true); }}
                          placeholder="e.g. 500"
                          className="text-2xl h-14 w-40 font-bold text-center bg-background shadow-inner"
                          disabled={isSubmitted}
                        />
                        <div className="flex-1 px-2">
                          <input 
                            type="range" 
                            min="100" 
                            max="5000" 
                            step="100"
                            value={localLeadCount || 500}
                            onChange={(e) => { setLocalLeadCount(e.target.value); setDirty(true); }}
                            className="w-full accent-indigo-600 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                            disabled={isSubmitted}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1 font-medium">
                             <span>100</span>
                             <span>2.5k</span>
                             <span>5k+</span>
                          </div>
                        </div>
                     </div>
                  </div>

                  <Separator />
                  
                  <div className="space-y-4">
                     <h4 className="font-semibold flex items-center gap-2 text-primary">
                       <FileEdit className="w-4 h-4" />
                       Strategy Details
                     </h4>
                     
                     <div className="grid gap-4">
                        <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objective</Label>
                           <Textarea 
                              value={localFields.objective || ''}
                              onChange={(e) => updateField('objective', e.target.value)}
                              rows={2}
                              className="resize-none focus-visible:ring-indigo-500"
                              placeholder="e.g. Book meetings with VP level attendees..."
                              disabled={isSubmitted}
                           />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Targeting Criteria</Label>
                           <Textarea 
                              value={localFields.targetingNotes || ''}
                              onChange={(e) => updateField('targetingNotes', e.target.value)}
                              rows={2}
                              className="resize-none focus-visible:ring-indigo-500"
                              placeholder="Specific titles, companies, or attendee types..."
                              disabled={isSubmitted}
                           />
                        </div>
                     </div>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t flex items-center justify-end gap-3 shrink-0">
                 {!isSubmitted && (
                   <>
                     <Button 
                       variant="ghost" 
                       onClick={handleSave}
                       disabled={!dirty || isSaving}
                       className="text-muted-foreground hover:text-foreground"
                     >
                       {isSaving ? 'Saving...' : 'Save Draft'}
                     </Button>
                     <Button 
                       onClick={async () => {
                          const leadCount = parseInt(localLeadCount, 10);
                          if (isNaN(leadCount) || leadCount <= 0) return;
                          setIsLaunching(true);
                          try {
                            await onSaveAndSubmit(localFields, leadCount);
                            setDirty(false);
                          } finally {
                            setIsLaunching(false);
                          }
                       }}
                       disabled={!canSubmit || isSubmitting || isLaunching}
                       className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-none min-w-[160px]"
                       size="lg"
                     >
                       {(isSubmitting || isLaunching) ? (
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                       ) : (
                          <Send className="h-5 w-5 mr-2" />
                       )}
                       Launch Campaign
                     </Button>
                   </>
                 )}
                 {isSubmitted && (
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                       Close Window
                    </Button>
                 )}
              </div>
           </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
