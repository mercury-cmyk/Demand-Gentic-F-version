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

type EventFormData = z.infer<typeof eventFormSchema>;

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: Event;
}

export function EventFormDialog({ open, onOpenChange, event }: EventFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!event;
  const [speakerSearch, setSpeakerSearch] = useState("");

  const { data: speakers = [] } = useQuery<any[]>({ 
    queryKey: ["/api/speakers"],
    enabled: open
  });
  
  const { data: organizers = [] } = useQuery<any[]>({ 
    queryKey: ["/api/organizers"],
    enabled: open
  });
  
  const { data: sponsors = [] } = useQuery<any[]>({ 
    queryKey: ["/api/sponsors"],
    enabled: open
  });

  const form = useForm<EventFormData>({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Event" : "Create Event"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the event details below." : "Fill in the details to create a new event."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.title}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Event title" data-testid="input-event-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.slug}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="event-slug" data-testid="input-event-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="eventType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.eventType}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-event-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="webinar">Webinar</SelectItem>
                        <SelectItem value="forum">Forum</SelectItem>
                        <SelectItem value="executive_dinner">Executive Dinner</SelectItem>
                        <SelectItem value="roundtable">Roundtable</SelectItem>
                        <SelectItem value="conference">Conference</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="locationType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.locationType}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-location-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="virtual">Virtual</SelectItem>
                        <SelectItem value="in_person">In Person</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="community"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.community}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-community">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="hr">HR</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="it">IT</SelectItem>
                        <SelectItem value="cx_ux">CX/UX</SelectItem>
                        <SelectItem value="data_ai">Data/AI</SelectItem>
                        <SelectItem value="ops">Ops</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="organizer"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{EVENT_FIELD_LABELS.organizer}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-organizer">
                          <SelectValue placeholder="Select organizer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {organizers.map((org: any) => (
                          <SelectItem key={org.id} value={org.name}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sponsor"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{EVENT_FIELD_LABELS.sponsor}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-sponsor">
                          <SelectValue placeholder="Select sponsor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sponsors.map((sponsor: any) => (
                          <SelectItem key={sponsor.id} value={sponsor.name}>
                            {sponsor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="speakers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{EVENT_FIELD_LABELS.speakers}</FormLabel>
                  <div className="space-y-2">
                    {selectedSpeakers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedSpeakers.map((speakerName: string) => {
                          const speaker = speakers.find((s: any) => s.name === speakerName);
                          return (
                            <Badge key={speakerName} variant="secondary" className="gap-1">
                              {speaker?.name || speakerName}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => {
                                  const newSpeakers = selectedSpeakers.filter(s => s !== speakerName);
                                  form.setValue("speakers", newSpeakers);
                                }}
                              />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn("w-full justify-between", !selectedSpeakers.length && "text-muted-foreground")}
                            data-testid="button-select-speakers"
                          >
                            {selectedSpeakers.length > 0 ? `${selectedSpeakers.length} speaker(s) selected` : "Select speakers"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput 
                            placeholder="Search speakers..." 
                            value={speakerSearch}
                            onValueChange={setSpeakerSearch}
                          />
                          <CommandList>
                            <CommandEmpty>No speakers found.</CommandEmpty>
                            <CommandGroup>
                              {availableSpeakers.map((speaker: any) => {
                                const isSelected = selectedSpeakers.includes(speaker.name);
                                return (
                                  <CommandItem
                                    key={speaker.id}
                                    onSelect={() => {
                                      const newSpeakers = isSelected
                                        ? selectedSpeakers.filter((s: string) => s !== speaker.name)
                                        : [...selectedSpeakers, speaker.name];
                                      form.setValue("speakers", newSpeakers);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                      <span>{speaker.name}</span>
                                      {speaker.title && speaker.company && (
                                        <span className="text-xs text-muted-foreground">
                                          {speaker.title} at {speaker.company}
                                        </span>
                                      )}
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="startIso"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.startIso}</FormLabel>
                    <FormControl>
                      <Input {...field} type="datetime-local" data-testid="input-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endIso"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.endIso}</FormLabel>
                    <FormControl>
                      <Input {...field} type="datetime-local" data-testid="input-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.timezone}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="America/New_York" data-testid="input-timezone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="overviewHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{EVENT_FIELD_LABELS.overviewHtml}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Event overview..." rows={4} data-testid="textarea-overview" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="thumbnailUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.thumbnailUrl}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://..." data-testid="input-thumbnail" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ctaLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.ctaLink}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://..." data-testid="input-cta-link" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="formId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.formId}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="form-id" data-testid="input-form-id" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{EVENT_FIELD_LABELS.status}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {isEdit ? "Update" : "Create"} Event
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
