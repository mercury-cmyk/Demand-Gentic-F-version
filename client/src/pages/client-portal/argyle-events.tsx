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
                        <Button
                          size="sm"
                          onClick={() => handleEventAction(event, 'create')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Target className="h-4 w-4 mr-1" />
                          Request Leads
                        </Button>
                      ) : event.draftStatus === 'submitted' ? (
                        <Button size="sm" variant="outline" disabled>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Work Order Created
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEventAction(event, 'edit')}
                          >
                            <FileEdit className="h-4 w-4 mr-1" />
                            Edit Draft
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleEventAction(event, 'create')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Target className="h-4 w-4 mr-1" />
                            Submit Work Order
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

      {/* Unified Work Order Form (same as Work Orders tab) */}
      <WorkOrderForm {...modalProps} />
    </>
  );
}
