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
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [step, setStep] = useState("date");
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    notes: ""
  });

  // Fetch Booking Info
  const { data: info, isLoading: infoLoading, error: infoError } = useQuery({
    queryKey: [`/api/bookings/public/${username}/${slug}`],
    enabled: !!username && !!slug
  });

  // Fetch Slots when date is selected
  const { data: slots, isLoading: slotsLoading } = useQuery({
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
      
        
          
            
              
                
                
                  
                  
                
              
              
            
            
              
              
              
            
          

          
            
              
              
            
            
              
                
              
            
          
        
      
    );
  }

  if (infoError || !info) {
    return (
      
        
          
            
            Booking Page Not Found
            The link you used seems to be invalid or expired.
          
        
      
    );
  }

  if (step === "success") {
    const start = selectedSlot ? new Date(selectedSlot) : null;
    const end = start ? new Date(start.getTime() + info.bookingType.duration * 60000) : null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
      
        
          
            
              
            
            Meeting Confirmed!
            
              You're booked for {info.bookingType.name} with {info.user.firstName}. A calendar invitation has been sent to{" "}
              {formData.email}.
            
            
              
                
                  
                
                
                  {start ? format(start, "EEEE, MMMM do, yyyy") : "-"}
                  
                    {start && end ? `${format(start, "h:mm a")} - ${format(end, "h:mm a")}` : "-"} ({tz})
                  
                
              
            
             window.location.reload()} variant="outline">
              Book Another
            
          
        
      
    );
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = startOfDay(new Date());
  const selectedStart = selectedSlot ? new Date(selectedSlot) : null;
  const selectedEnd = selectedStart ? new Date(selectedStart.getTime() + info.bookingType.duration * 60000) : null;

  return (
    
      
        
        {/* Info Sidebar */}
        
          
            
              
                
                  
                    {getInitials(info.user.firstName, info.user.lastName)}
                  
                
                
                  
                    {info.user.firstName} {info.user.lastName}
                  
                  {info.bookingType.name}
                
              

              
                
                  
                  {info.bookingType.duration} minutes
                
                
                  
                  Times shown in {tz}
                
              
            
            
              {info.bookingType.description ? (
                
                  {info.bookingType.description}
                
              ) : (
                No description provided.
              )}

              {selectedStart && selectedEnd ? (
                <>
                  
                  
                    Selected
                    
                      {format(selectedStart, "EEE, MMM d")} at {format(selectedStart, "h:mm a")} - {format(selectedEnd, "h:mm a")}
                    
                  
                
              ) : null}
            
          
        

        {/* Main Content */}
        
          
            
              Schedule a meeting
              
                {step === "date" ? "Pick a date and time that works for you." : "Tell us a bit about yourself."}
              
            
            
              
                
                  
                    1
                  
                  Time
                
                
                
                  
                    2
                  
                  Details
                
                
                
                  
                    3
                  
                  Confirm
                
              

              {step === "date" && (
                
                  
                    
                      
                      Select a date
                    
                     {
                        setSelectedDate(date);
                        setSelectedSlot(null);
                      }}
                      className="rounded-md border shadow-sm mx-auto"
                      disabled={(date) => isBefore(date, today)}
                    />
                  
                  
                  
                    
                      
                        
                          
                          {selectedDate ? format(selectedDate, "EEEE, MMMM do") : "Select a date"}
                        
                        Times shown in {tz}
                      
                      {selectedSlot ? (
                         setStep("form")}
                          className="shrink-0"
                          disabled={!selectedSlot}
                        >
                          Continue
                        
                      ) : null}
                    
                    
                    {slotsLoading ? (
                      
                        
                      
                    ) : (
                      
                        
                          {slots?.length === 0 ? (
                            
                              No times available for this date. Try another day.
                            
                          ) : (
                            slots?.map((slot, i) => {
                              const start = new Date(slot.start);
                              const end = new Date(start.getTime() + info.bookingType.duration * 60000);
                              const isSelected = selectedSlot === slot.start;

                              return (
                                 setSelectedSlot(slot.start)}
                                >
                                  {format(start, "h:mm a")}
                                  
                                    {format(end, "h:mm a")}
                                  
                                
                              );
                            })
                          )}
                        
                      
                    )}

                    
                       setSelectedSlot(null)}
                        disabled={!selectedSlot}
                      >
                        Clear selection
                      
                       setStep("form")}
                        disabled={!selectedSlot}
                      >
                        Continue
                      
                    
                  
                
              )}

              {step === "form" && (
                
                  
                    Enter Details
                     {
                        setStep("date");
                      }}
                    >
                      Back
                    
                  

                  
                    
                      
                        {info.bookingType.name}
                        
                          {selectedStart ? format(selectedStart, "EEEE, MMMM do, yyyy") : "-"}
                          {selectedStart ? ` at ${format(selectedStart, "h:mm a")}` : ""}
                          {selectedEnd ? ` - ${format(selectedEnd, "h:mm a")}` : ""} ({tz})
                        
                      
                      
                        
                        {info.bookingType.duration}m
                      
                    
                  

                  
                    
                      Full Name
                      
                        
                         setFormData({ ...formData, name: e.target.value })}
                          placeholder="John Doe"
                          className="pl-10"
                        />
                      
                    
                    
                      Email Address
                      
                        
                         setFormData({ ...formData, email: e.target.value })}
                          placeholder="john@example.com"
                          className="pl-10"
                        />
                      
                    
                    
                      Additional Notes
                       setFormData({...formData, notes: e.target.value})}
                        placeholder="Please share anything that will help prepare for our meeting."
                      />
                    
                  

                   bookMutation.mutate()}
                    disabled={!selectedSlot || !formData.name || !formData.email || bookMutation.isPending}
                  >
                    {bookMutation.isPending ? (
                      <>
                        
                        Booking...
                      
                    ) : (
                      "Schedule Event"
                    )}
                  
                
              )}
            
          
        
      
    
  );
}