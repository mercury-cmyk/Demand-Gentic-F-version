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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
  Send,
  Plus,
  Clock,
  Users,
  Target,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
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
  draft: {
    id: string;
    status: string;
    sourceFields: Record<string, any>;
    draftFields: Record<string, any>;
    editedFields: string[];
    leadCount: number | null;
    workOrderId: string | null;
    submittedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  event: {
    id: string;
    externalId: string;
    sourceUrl: string;
    title: string;
    community: string | null;
    eventType: string | null;
    location: string | null;
    startAtIso: string | null;
    startAtHuman: string | null;
    lastSyncedAt: string;
  } | null;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'not_created':
      return <Badge variant="outline" className="text-muted-foreground">No Draft</Badge>;
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>;
    case 'ready':
      return <Badge className="bg-blue-100 text-blue-800">Ready</Badge>;
    case 'submitted':
      return <Badge className="bg-green-100 text-green-800">Ordered</Badge>;
    case 'cancelled':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function EventTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const colors: Record<string, string> = {
    'Forum': 'bg-purple-100 text-purple-800',
    'Webinar': 'bg-sky-100 text-sky-800',
    'Summit': 'bg-amber-100 text-amber-800',
    'Expo': 'bg-emerald-100 text-emerald-800',
  };
  return (
    <Badge className={colors[type] || 'bg-gray-100 text-gray-800'}>
      {type}
    </Badge>
  );
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
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
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

  // Fetch draft detail
  const { data: draftData, isLoading: draftLoading } = useQuery<DraftDetail>({
    queryKey: ['argyle-draft', selectedDraftId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/argyle-events/drafts/${selectedDraftId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch draft');
      return res.json();
    },
    enabled: !!selectedDraftId && showDraftDialog,
  });

  // Create draft mutation
  const createDraftMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/client-portal/argyle-events/events/${eventId}/create-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to create draft');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      setSelectedDraftId(data.draftId);
      setShowDraftDialog(true);
      toast({
        title: data.alreadyExists ? 'Draft already exists' : 'Draft created',
        description: data.alreadyExists
          ? 'Opening your existing draft.'
          : 'Campaign draft created from event. Set your lead count to submit.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update draft mutation
  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, draftFields, leadCount }: { id: string; draftFields?: Record<string, any>; leadCount?: number }) => {
      const res = await fetch(`/api/client-portal/argyle-events/drafts/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draftFields, leadCount }),
      });
      if (!res.ok) throw new Error('Failed to update draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['argyle-draft', selectedDraftId] });
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      toast({ title: 'Draft saved', description: 'Your changes have been saved.' });
    },
  });

  // Submit draft mutation
  const submitDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/argyle-events/drafts/${id}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      queryClient.invalidateQueries({ queryKey: ['argyle-draft', selectedDraftId] });
      setShowDraftDialog(false);
      toast({
        title: 'Order submitted!',
        description: `Work order ${data.orderNumber} has been created. Our team will review and begin work.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
    },
  });

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Upcoming Events</h1>
            <p className="text-muted-foreground">
              Draft campaigns from upcoming Argyle events. Set your lead count and submit to order.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {events.length > 0 && events[0].lastSyncedAt
                ? `Synced: ${new Date(events[0].lastSyncedAt).toLocaleDateString()}`
                : 'Not synced'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              {syncMutation.isPending ? 'Syncing…' : 'Sync Events'}
            </Button>
          </div>
        </div>

        {/* Events list */}
        {(eventsLoading || syncMutation.isPending) ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {syncMutation.isPending ? 'Syncing events from Argyle calendar…' : 'Loading events…'}
            </p>
          </div>
        ) : upcomingEvents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No upcoming events</h3>
              <p className="text-muted-foreground text-sm mt-1 mb-4">
                Click "Sync Events" to fetch the latest from the Argyle calendar.
              </p>
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Events Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {upcomingEvents.map((event) => (
              <Card key={event.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Event info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{event.title}</h3>
                        <EventTypeBadge type={event.eventType} />
                        {event.community && (
                          <Badge variant="outline" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {event.community}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {event.startAtHuman || 'Date TBD'}
                          {event.needsDateReview && (
                            <AlertCircle className="h-3 w-3 text-amber-500" />
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {event.location || 'TBD'}
                        </span>
                        <a
                          href={event.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Event
                        </a>
                      </div>
                    </div>

                    {/* Draft status + action */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={event.draftStatus} />
                      {event.draftLeadCount && (
                        <span className="text-sm font-medium text-muted-foreground">
                          <Users className="h-3.5 w-3.5 inline mr-1" />
                          {event.draftLeadCount} leads
                        </span>
                      )}
                      {event.draftStatus === 'not_created' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createDraftMutation.mutate(event.id)}
                            disabled={createDraftMutation.isPending}
                          >
                            {createDraftMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="h-4 w-4 mr-1" />
                            )}
                            Draft
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              openModal({
                                mode: 'event',
                                eventContext: {
                                  externalEventId: event.id,
                                  eventTitle: event.title,
                                  eventDate: event.startAtHuman || event.startAtIso || '',
                                  eventType: event.eventType || 'event',
                                  eventLocation: event.location || '',
                                  eventCommunity: event.community || '',
                                  eventSourceUrl: event.sourceUrl || '',
                                },
                              });
                            }}
                          >
                            <Target className="h-4 w-4 mr-1" />
                            Request Leads
                          </Button>
                        </div>
                      ) : event.draftStatus === 'submitted' ? (
                        <Button size="sm" variant="outline" disabled>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Ordered
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedDraftId(event.draftId);
                              setShowDraftDialog(true);
                            }}
                          >
                            <FileEdit className="h-4 w-4 mr-1" />
                            Edit Draft
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (event.draftId) {
                                submitDraftMutation.mutate(event.draftId);
                              }
                            }}
                            disabled={submitDraftMutation.isPending}
                          >
                            {submitDraftMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Send className="h-4 w-4 mr-1" />
                            )}
                            Submit Order
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Draft Editor Dialog */}
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
        onSubmit={() => {
          if (selectedDraftId) {
            submitDraftMutation.mutate(selectedDraftId);
          }
        }}
        isSaving={updateDraftMutation.isPending}
        isSubmitting={submitDraftMutation.isPending}
      />

      {/* Shared Direct Agentic Order Modal (same form as Work Orders) */}
      <WorkOrderForm {...modalProps} />
    </>
  );
}

// ==================== Draft Editor Dialog ====================

interface DraftEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftData: DraftDetail | null;
  isLoading: boolean;
  onSave: (fields: Record<string, any>, leadCount: number) => void;
  onSubmit: () => void;
  isSaving: boolean;
  isSubmitting: boolean;
}

function DraftEditorDialog({
  open,
  onOpenChange,
  draftData,
  isLoading,
  onSave,
  onSubmit,
  isSaving,
  isSubmitting,
}: DraftEditorDialogProps) {
  const [localFields, setLocalFields] = useState<Record<string, any>>({});
  const [localLeadCount, setLocalLeadCount] = useState<string>('');
  const [dirty, setDirty] = useState(false);

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
  const editedFields = draftData?.draft?.editedFields || [];
  const canSubmit = !isSubmitted && localLeadCount && parseInt(localLeadCount, 10) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            Campaign Draft
            {isSubmitted && <Badge className="bg-green-100 text-green-800">Submitted</Badge>}
          </DialogTitle>
          <DialogDescription>
            {draftData?.event ? (
              <span className="flex items-center gap-2 mt-1">
                <a
                  href={draftData.event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View source event
                </a>
                {draftData.event.lastSyncedAt && (
                  <span className="text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Last synced: {new Date(draftData.event.lastSyncedAt).toLocaleString()}
                  </span>
                )}
                {editedFields.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {editedFields.length} field(s) edited
                  </Badge>
                )}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* LEAD COUNT — Primary required field */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <Label htmlFor="leadCount" className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Number of Leads *
              </Label>
              <p className="text-sm text-muted-foreground mb-2">
                This is the only required field to submit your order.
              </p>
              <Input
                id="leadCount"
                type="number"
                min="1"
                placeholder="e.g., 500"
                value={localLeadCount}
                onChange={(e) => { setLocalLeadCount(e.target.value); setDirty(true); }}
                disabled={isSubmitted}
                className="max-w-xs text-lg font-medium"
              />
            </div>

            <Separator />

            {/* Campaign Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="flex items-center gap-2">
                Campaign Title
                {editedFields.includes('title') && <Badge variant="outline" className="text-xs">Edited</Badge>}
              </Label>
              <Input
                id="title"
                value={localFields.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                disabled={isSubmitted}
              />
            </div>

            {/* Context */}
            <div className="space-y-2">
              <Label htmlFor="context" className="flex items-center gap-2">
                Context / Overview
                {editedFields.includes('context') && <Badge variant="outline" className="text-xs">Edited</Badge>}
              </Label>
              <Textarea
                id="context"
                rows={5}
                value={localFields.context || ''}
                onChange={(e) => updateField('context', e.target.value)}
                disabled={isSubmitted}
              />
            </div>

            {/* Objective */}
            <div className="space-y-2">
              <Label htmlFor="objective" className="flex items-center gap-2">
                Objective
                {editedFields.includes('objective') && <Badge variant="outline" className="text-xs">Edited</Badge>}
              </Label>
              <Textarea
                id="objective"
                rows={2}
                value={localFields.objective || ''}
                onChange={(e) => updateField('objective', e.target.value)}
                disabled={isSubmitted}
              />
            </div>

            {/* Targeting Notes */}
            <div className="space-y-2">
              <Label htmlFor="targetingNotes" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Targeting Notes
                {editedFields.includes('targetingNotes') && <Badge variant="outline" className="text-xs">Edited</Badge>}
              </Label>
              <Textarea
                id="targetingNotes"
                rows={3}
                value={localFields.targetingNotes || ''}
                onChange={(e) => updateField('targetingNotes', e.target.value)}
                disabled={isSubmitted}
              />
            </div>

            {/* Timing Notes */}
            <div className="space-y-2">
              <Label htmlFor="timingNotes" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timing / Outreach Window
                {editedFields.includes('timingNotes') && <Badge variant="outline" className="text-xs">Edited</Badge>}
              </Label>
              <Textarea
                id="timingNotes"
                rows={2}
                value={localFields.timingNotes || ''}
                onChange={(e) => updateField('timingNotes', e.target.value)}
                disabled={isSubmitted}
              />
            </div>

            {/* Event Details (read-only from source) */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm">Event Details (from source)</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Date:</span>{' '}
                  {localFields.eventDate || 'TBD'}
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  {localFields.eventType || 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Community:</span>{' '}
                  {localFields.eventCommunity || 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>{' '}
                  {localFields.eventLocation || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:gap-0">
          {!isSubmitted && (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!dirty || isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Draft
              </Button>
              <Button
                onClick={() => {
                  if (dirty) handleSave();
                  onSubmit();
                }}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Submit Order
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
