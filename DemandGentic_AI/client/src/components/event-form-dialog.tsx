import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Event } from "@shared/schema";
import { EVENT_FIELD_LABELS } from "@shared/field-labels";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const eventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  eventType: z.enum(["webinar", "forum", "executive_dinner", "roundtable", "conference"]),
  locationType: z.enum(["virtual", "in_person", "hybrid"]),
  community: z.enum(["hr", "finance", "marketing", "it", "cx_ux", "data_ai", "ops"]),
  organizer: z.string().optional(),
  sponsor: z.string().optional(),
  speakers: z.array(z.string()).optional(),
  startIso: z.string().min(1, "Start date is required"),
  endIso: z.string().optional(),
  timezone: z.string().optional(),
  overviewHtml: z.string().optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  ctaLink: z.string().url().optional().or(z.literal("")),
  formId: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

type EventFormData = z.infer;

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: Event;
}

export function EventFormDialog({ open, onOpenChange, event }: EventFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!event;
  const [speakerSearch, setSpeakerSearch] = useState("");

  const { data: speakers = [] } = useQuery({ 
    queryKey: ["/api/speakers"],
    enabled: open
  });
  
  const { data: organizers = [] } = useQuery({ 
    queryKey: ["/api/organizers"],
    enabled: open
  });
  
  const { data: sponsors = [] } = useQuery({ 
    queryKey: ["/api/sponsors"],
    enabled: open
  });

  const form = useForm({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: event?.title || "",
      slug: event?.slug || "",
      eventType: event?.eventType || "webinar",
      locationType: event?.locationType || "virtual",
      community: event?.community || "marketing",
      organizer: event?.organizer || "",
      sponsor: event?.sponsor || "",
      speakers: (event?.speakers as string[]) || [],
      startIso: event?.startIso || "",
      endIso: event?.endIso || "",
      timezone: event?.timezone || "",
      overviewHtml: event?.overviewHtml || "",
      thumbnailUrl: event?.thumbnailUrl || "",
      ctaLink: event?.ctaLink || "",
      formId: event?.formId || "",
      status: event?.status || "draft",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      return await apiRequest("/api/events", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Event created",
        description: "The event has been successfully created.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create event.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      return await apiRequest(`/api/events/${event?.id}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Event updated",
        description: "The event has been successfully updated.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update event.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EventFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const selectedSpeakers = form.watch("speakers") || [];
  const availableSpeakers = speakers.filter(s => 
    s.name.toLowerCase().includes(speakerSearch.toLowerCase())
  );

  return (
    
      
        
          {isEdit ? "Edit Event" : "Create Event"}
          
            {isEdit ? "Update the event details below." : "Fill in the details to create a new event."}
          
        
        
          
            
               (
                  
                    {EVENT_FIELD_LABELS.title}
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.slug}
                    
                      
                    
                    
                  
                )}
              />
            

            
               (
                  
                    {EVENT_FIELD_LABELS.eventType}
                    
                      
                        
                          
                        
                      
                      
                        Webinar
                        Forum
                        Executive Dinner
                        Roundtable
                        Conference
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.locationType}
                    
                      
                        
                          
                        
                      
                      
                        Virtual
                        In Person
                        Hybrid
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.community}
                    
                      
                        
                          
                        
                      
                      
                        HR
                        Finance
                        Marketing
                        IT
                        CX/UX
                        Data/AI
                        Ops
                      
                    
                    
                  
                )}
              />
            

            
               (
                  
                    {EVENT_FIELD_LABELS.organizer}
                    
                      
                        
                          
                        
                      
                      
                        {organizers.map((org: any) => (
                          
                            {org.name}
                          
                        ))}
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.sponsor}
                    
                      
                        
                          
                        
                      
                      
                        {sponsors.map((sponsor: any) => (
                          
                            {sponsor.name}
                          
                        ))}
                      
                    
                    
                  
                )}
              />
            

             (
                
                  {EVENT_FIELD_LABELS.speakers}
                  
                    {selectedSpeakers.length > 0 && (
                      
                        {selectedSpeakers.map((speakerName: string) => {
                          const speaker = speakers.find((s: any) => s.name === speakerName);
                          return (
                            
                              {speaker?.name || speakerName}
                               {
                                  const newSpeakers = selectedSpeakers.filter(s => s !== speakerName);
                                  form.setValue("speakers", newSpeakers);
                                }}
                              />
                            
                          );
                        })}
                      
                    )}
                    
                      
                        
                          
                            {selectedSpeakers.length > 0 ? `${selectedSpeakers.length} speaker(s) selected` : "Select speakers"}
                            
                          
                        
                      
                      
                        
                          
                          
                            No speakers found.
                            
                              {availableSpeakers.map((speaker: any) => {
                                const isSelected = selectedSpeakers.includes(speaker.name);
                                return (
                                   {
                                      const newSpeakers = isSelected
                                        ? selectedSpeakers.filter((s: string) => s !== speaker.name)
                                        : [...selectedSpeakers, speaker.name];
                                      form.setValue("speakers", newSpeakers);
                                    }}
                                  >
                                    
                                    
                                      {speaker.name}
                                      {speaker.title && speaker.company && (
                                        
                                          {speaker.title} at {speaker.company}
                                        
                                      )}
                                    
                                  
                                );
                              })}
                            
                          
                        
                      
                    
                  
                  
                
              )}
            />

            
               (
                  
                    {EVENT_FIELD_LABELS.startIso}
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.endIso}
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.timezone}
                    
                      
                    
                    
                  
                )}
              />
            

             (
                
                  {EVENT_FIELD_LABELS.overviewHtml}
                  
                    
                  
                  
                
              )}
            />

            
               (
                  
                    {EVENT_FIELD_LABELS.thumbnailUrl}
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.ctaLink}
                    
                      
                    
                    
                  
                )}
              />
            

            
               (
                  
                    {EVENT_FIELD_LABELS.formId}
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    {EVENT_FIELD_LABELS.status}
                    
                      
                        
                          
                        
                      
                      
                        Draft
                        Published
                        Archived
                      
                    
                    
                  
                )}
              />
            

            
               onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              
              
                {isEdit ? "Update" : "Create"} Event
              
            
          
        
      
    
  );
}