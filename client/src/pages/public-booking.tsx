
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { endOfDay, format, isBefore, startOfDay } from "date-fns";
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Loader2, Mail, User2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BookingType {
  id: number;
  name: string;
  description: string;
  duration: number;
}

interface UserProfile {
  firstName: string;
  lastName: string;
  username: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

function getInitials(firstName: string, lastName: string) {
  const first = (firstName || "").trim()[0] || "";
  const last = (lastName || "").trim()[0] || "";
  return (first + last).toUpperCase() || "?";
}

export default function PublicBookingPage() {
  const { username, slug } = useParams();
  const { toast } = useToast();
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"date" | "form" | "success">("date");
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    notes: ""
  });

  // Fetch Booking Info
  const { data: info, isLoading: infoLoading, error: infoError } = useQuery<{ user: UserProfile, bookingType: BookingType }>({
    queryKey: [`/api/bookings/public/${username}/${slug}`],
    enabled: !!username && !!slug
  });

  // Fetch Slots when date is selected
  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: [`/api/bookings/public/${username}/${slug}/slots`, selectedDate],
    queryFn: async () => {
      if (!selectedDate) return [];
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);
      
      const res = await apiRequest("GET", `/api/bookings/public/${username}/${slug}/slots?start=${start.toISOString()}&end=${end.toISOString()}`);
      return res.json();
    },
    enabled: !!selectedDate && !!info
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bookings/public/${username}/${slug}/book`, {
        guestName: formData.name,
        guestEmail: formData.email,
        guestNotes: formData.notes,
        startTime: selectedSlot
      });
      return res.json();
    },
    onSuccess: () => {
      setStep("success");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Booking Failed",
        description: error.message
      });
    }
  });

  if (infoLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/40 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-28" />
                </div>
              </div>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-80" />
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (infoError || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Booking Page Not Found</h2>
            <p className="text-muted-foreground">The link you used seems to be invalid or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    const start = selectedSlot ? new Date(selectedSlot) : null;
    const end = start ? new Date(start.getTime() + info.bookingType.duration * 60000) : null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Meeting Confirmed!</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              You're booked for <strong>{info.bookingType.name}</strong> with {info.user.firstName}. A calendar invitation has been sent to{" "}
              <span className="font-medium text-foreground">{formData.email}</span>.
            </p>
            <div className="bg-muted/60 border rounded-lg p-4 mb-6 text-left">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-background p-2 border">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{start ? format(start, "EEEE, MMMM do, yyyy") : "-"}</p>
                  <p className="text-sm text-muted-foreground">
                    {start && end ? `${format(start, "h:mm a")} - ${format(end, "h:mm a")}` : "-"} ({tz})
                  </p>
                </div>
              </div>
            </div>
            <Button onClick={() => window.location.reload()} variant="outline">
              Book Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = startOfDay(new Date());
  const selectedStart = selectedSlot ? new Date(selectedSlot) : null;
  const selectedEnd = selectedStart ? new Date(selectedStart.getTime() + info.bookingType.duration * 60000) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Info Sidebar */}
        <div className="md:col-span-1 space-y-6 md:sticky md:top-8 md:self-start">
          <Card className="shadow-sm">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(info.user.firstName, info.user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground truncate">
                    {info.user.firstName} {info.user.lastName}
                  </p>
                  <p className="font-semibold leading-tight">{info.bookingType.name}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{info.bookingType.duration} minutes</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  <span>Times shown in {tz}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {info.bookingType.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {info.bookingType.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No description provided.</p>
              )}

              {selectedStart && selectedEnd ? (
                <>
                  <Separator />
                  <div className="rounded-lg border bg-background/60 p-3">
                    <p className="text-sm font-medium">Selected</p>
                    <p className="text-sm text-muted-foreground">
                      {format(selectedStart, "EEE, MMM d")} at {format(selectedStart, "h:mm a")} - {format(selectedEnd, "h:mm a")}
                    </p>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="md:col-span-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Schedule a meeting</CardTitle>
              <CardDescription>
                {step === "date" ? "Pick a date and time that works for you." : "Tell us a bit about yourself."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-sm mb-6">
                <div className={`flex items-center gap-2 ${step === "date" ? "text-foreground" : "text-muted-foreground"}`}>
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${step === "date" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                    1
                  </span>
                  <span className="font-medium">Time</span>
                </div>
                <div className="h-px flex-1 bg-border" />
                <div className={`flex items-center gap-2 ${step === "form" ? "text-foreground" : "text-muted-foreground"}`}>
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${step === "form" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                    2
                  </span>
                  <span className="font-medium">Details</span>
                </div>
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold bg-background">
                    3
                  </span>
                  <span className="font-medium">Confirm</span>
                </div>
              </div>

              {step === "date" && (
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      Select a date
                    </h3>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setSelectedSlot(null);
                      }}
                      className="rounded-md border shadow-sm mx-auto"
                      disabled={(date) => isBefore(date, today)}
                    />
                  </div>
                  
                  <div className="md:border-l md:pl-8">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {selectedDate ? format(selectedDate, "EEEE, MMMM do") : "Select a date"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">Times shown in {tz}</p>
                      </div>
                      {selectedSlot ? (
                        <Button
                          onClick={() => setStep("form")}
                          className="shrink-0"
                          disabled={!selectedSlot}
                        >
                          Continue
                        </Button>
                      ) : null}
                    </div>
                    
                    {slotsLoading ? (
                      <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/20">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <ScrollArea className="h-[320px] rounded-lg border bg-background/60">
                        <div className="p-3 space-y-2">
                          {slots?.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-10 text-center">
                              No times available for this date. Try another day.
                            </div>
                          ) : (
                            slots?.map((slot, i) => {
                              const start = new Date(slot.start);
                              const end = new Date(start.getTime() + info.bookingType.duration * 60000);
                              const isSelected = selectedSlot === slot.start;

                              return (
                                <Button
                                  key={i}
                                  variant={isSelected ? "default" : "outline"}
                                  className="w-full justify-between"
                                  onClick={() => setSelectedSlot(slot.start)}
                                >
                                  <span>{format(start, "h:mm a")}</span>
                                  <span className={`text-xs ${isSelected ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                                    {format(end, "h:mm a")}
                                  </span>
                                </Button>
                              );
                            })
                          )}
                        </div>
                      </ScrollArea>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedSlot(null)}
                        disabled={!selectedSlot}
                      >
                        Clear selection
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setStep("form")}
                        disabled={!selectedSlot}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {step === "form" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Enter Details</h3>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep("date");
                      }}
                    >
                      Back
                    </Button>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{info.bookingType.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedStart ? format(selectedStart, "EEEE, MMMM do, yyyy") : "-"}
                          {selectedStart ? ` at ${format(selectedStart, "h:mm a")}` : ""}
                          {selectedEnd ? ` - ${format(selectedEnd, "h:mm a")}` : ""} ({tz})
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                        <Clock className="h-4 w-4" />
                        <span>{info.bookingType.duration}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <div className="relative">
                        <User2 className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="John Doe"
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="relative">
                        <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="john@example.com"
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Additional Notes</Label>
                      <Textarea 
                        id="notes" 
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        placeholder="Please share anything that will help prepare for our meeting."
                      />
                    </div>
                  </div>

                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => bookMutation.mutate()}
                    disabled={!selectedSlot || !formData.name || !formData.email || bookMutation.isPending}
                  >
                    {bookMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Booking...
                      </>
                    ) : (
                      "Schedule Event"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
