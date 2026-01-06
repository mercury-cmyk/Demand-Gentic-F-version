import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, MapPin, Users, Trash2, Edit } from "lucide-react";
import { format } from "date-fns";
import type { Event } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { EventFormDialog } from "@/components/event-form-dialog";

export default function Events() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<Event | undefined>(undefined);

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/events/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Event deleted",
        description: "The event has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete event.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Events</h1>
        </div>
        <div className="text-muted-foreground">Loading events...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Events</h1>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-event">
          <Plus className="h-4 w-4 mr-2" />
          Create Event
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No events yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first event to get started
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-event">
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <Card key={event.id} data-testid={`card-event-${event.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle>{event.title}</CardTitle>
                      <Badge variant="outline" data-testid={`badge-event-type-${event.id}`}>
                        {event.eventType}
                      </Badge>
                      {event.status && (
                        <Badge 
                          variant={event.status === 'published' ? 'default' : 'secondary'}
                          data-testid={`badge-status-${event.id}`}
                        >
                          {event.status}
                        </Badge>
                      )}
                    </div>
                    {event.overviewHtml && (
                      <CardDescription>{event.overviewHtml.substring(0, 150)}...</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => setEditEvent(event)}
                      data-testid={`button-edit-${event.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(event.id)}
                      data-testid={`button-delete-${event.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-date-${event.id}`}>
                      {event.startIso ? format(new Date(event.startIso), "PPP") : "TBD"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-location-${event.id}`}>
                      {event.locationType || "TBD"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-community-${event.id}`}>
                      {event.community}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EventFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      
      <EventFormDialog
        open={!!editEvent}
        onOpenChange={(open) => !open && setEditEvent(undefined)}
        event={editEvent}
      />
    </div>
  );
}
