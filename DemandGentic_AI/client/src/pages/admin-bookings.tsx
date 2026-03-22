import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { 
  Calendar, 
  Clock, 
  User, 
  Mail, 
  Video, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ExternalLink
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Booking {
  id: number;
  guestName: string;
  guestEmail: string;
  hostName: string;
  bookingType: string;
  startTime: string;
  endTime: string;
  status: string;
  meetingUrl?: string;
}

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState('upcoming');

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['/api/bookings/admin/all', filter],
    queryFn: async () => {
      // In a real implementation this would call an API
      // Since we haven't implemented the admin API yet, let's assume it exists or mock it for now
      // Or better, let's implement the API route too.
      // For now, I'll fetch from a new endpoint I'll add.
      const res = await apiRequest('GET', `/api/bookings/admin/all?filter=${filter}`);
      return res.json();
    }
  });

  return (
    
      
        
          Booking Management
          
            View and manage all scheduled meetings across the organization.
          
        
        
           setFilter('upcoming')}
          >
            Upcoming
          
           setFilter('past')}
          >
            Past
          
           setFilter('all')}
          >
            All
          
        
      

      
        
          Scheduled Meetings
          
            {bookings?.length || 0} {filter} bookings found
          
        
        
          {isLoading ? (
            
              
            
          ) : !bookings || bookings.length === 0 ? (
            
              
              No bookings found for the selected period.
            
          ) : (
            
              
                
                  Date & Time
                  Guest
                  Meeting Type
                  Host
                  Status
                  Actions
                
              
              
                {bookings.map((booking) => (
                  
                    
                      
                        
                          
                          {format(new Date(booking.startTime), "MMM d, yyyy")}
                        
                        
                          
                          {format(new Date(booking.startTime), "h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                        
                      
                    
                    
                      
                        {booking.guestName}
                        
                          
                          {booking.guestEmail}
                        
                      
                    
                    
                      
                        {booking.bookingType}
                      
                    
                    
                      
                        
                          {booking.hostName.charAt(0)}
                        
                        {booking.hostName}
                      
                    
                    
                      {booking.status === 'confirmed' ? (
                        
                          Confirmed
                        
                      ) : (
                        {booking.status}
                      )}
                    
                    
                      {booking.meetingUrl && (
                        
                          
                            
                            Join
                          
                        
                      )}
                    
                  
                ))}
              
            
          )}
        
      
    
  );
}