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
  const [editEvent, setEditEvent] = useState(undefined);

  const { data: events = [], isLoading } = useQuery({
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
      
        
          
          Events
        
        Loading events...
      
    );
  }

  return (
    
      
        
          
          Events
        
         setCreateDialogOpen(true)} data-testid="button-create-event">
          
          Create Event
        
      

      {events.length === 0 ? (
        
          
            
              
              No events yet
              
                Create your first event to get started
              
               setCreateDialogOpen(true)} data-testid="button-create-first-event">
                
                Create Event
              
            
          
        
      ) : (
        
          {events.map((event) => (
            
              
                
                  
                    
                      {event.title}
                      
                        {event.eventType}
                      
                      {event.status && (
                        
                          {event.status}
                        
                      )}
                    
                    {event.overviewHtml && (
                      {event.overviewHtml.substring(0, 150)}...
                    )}
                  
                  
                     setEditEvent(event)}
                      data-testid={`button-edit-${event.id}`}
                    >
                      
                    
                     deleteMutation.mutate(event.id)}
                      data-testid={`button-delete-${event.id}`}
                    >
                      
                    
                  
                
              
              
                
                  
                    
                    
                      {event.startIso ? format(new Date(event.startIso), "PPP") : "TBD"}
                    
                  
                  
                    
                    
                      {event.locationType || "TBD"}
                    
                  
                  
                    
                    
                      {event.community}
                    
                  
                
              
            
          ))}
        
      )}

      
      
       !open && setEditEvent(undefined)}
        event={editEvent}
      />
    
  );
}