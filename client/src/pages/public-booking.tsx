
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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
      const start = new Date(selectedDate);
      start.setHours(0,0,0,0);
      const end = new Date(selectedDate);
      end.setHours(23,59,59,999);
      
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (infoError || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Meeting Confirmed!</h2>
            <p className="text-muted-foreground mb-6">
              You are booked for <strong>{info.bookingType.name}</strong> with {info.user.firstName}.<br/>
              A calendar invitation has been sent to {formData.email}.
            </p>
            <div className="bg-muted p-4 rounded-lg mb-6">
              <p className="font-medium">
                {selectedSlot && format(new Date(selectedSlot), "EEEE, MMMM do, yyyy")}
              </p>
              <p>
                {selectedSlot && format(new Date(selectedSlot), "h:mm a")} - 
                {selectedSlot && format(new Date(new Date(selectedSlot).getTime() + info.bookingType.duration * 60000), "h:mm a")}
              </p>
            </div>
            <Button onClick={() => window.location.reload()} variant="outline">
              Book Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Info Sidebar */}
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {info.user.firstName[0]}
                </div>
                <div>
                  <div className="font-medium text-sm text-muted-foreground">
                    {info.user.firstName} {info.user.lastName}
                  </div>
                  <div className="font-bold">{info.bookingType.name}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium bg-secondary px-2 py-1 rounded text-primary">
                  {info.bookingType.duration} min
                </span>
                <span>Web Conferencing</span>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {info.bookingType.description}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="md:col-span-2">
          <Card>
            <CardContent className="p-6">
              {step === "date" && (
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="font-semibold mb-4">Select a Date</h3>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className="rounded-md border shadow-sm mx-auto"
                      disabled={(date) => date < new Date() || date.getDay() === 0 || date.getDay() === 6} 
                    />
                  </div>
                  
                  <div className="border-l pl-8 sm:border-l-0 sm:pl-0 md:border-l md:pl-8">
                    <h3 className="font-semibold mb-4">
                      {selectedDate ? format(selectedDate, "EEEE, MMMM do") : "Select a date"}
                    </h3>
                    
                    {slotsLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-2 h-[300px] overflow-y-auto pr-2">
                        {slots?.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No slots available for this date.</p>
                        ) : (
                          slots?.map((slot, i) => (
                            <Button
                              key={i}
                              variant={selectedSlot === slot.start ? "default" : "outline"}
                              className="w-full justify-start"
                              onClick={() => {
                                setSelectedSlot(slot.start);
                                setStep("form");
                              }}
                            >
                              {format(new Date(slot.start), "h:mm a")}
                            </Button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === "form" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Enter Details</h3>
                    <Button variant="ghost" onClick={() => { setStep("date"); setSelectedSlot(null); }}>
                      Back to Calendar
                    </Button>
                  </div>

                  <div className="bg-muted p-4 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="font-medium text-primary">
                        {info.bookingType.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedSlot && format(new Date(selectedSlot), "EEEE, MMMM do, yyyy • h:mm a")}
                      </p>
                    </div>
                    <div className="font-bold text-lg">
                      {info.bookingType.duration}m
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input 
                        id="name" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="john@example.com"
                      />
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
                    disabled={!formData.name || !formData.email || bookMutation.isPending}
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
