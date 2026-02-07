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
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');

  const { data: bookings, isLoading } = useQuery<Booking[]>({
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
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Booking Management</h1>
          <p className="text-muted-foreground mt-2">
            View and manage all scheduled meetings across the organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={filter === 'upcoming' ? "default" : "outline"}
            onClick={() => setFilter('upcoming')}
          >
            Upcoming
          </Button>
          <Button 
            variant={filter === 'past' ? "default" : "outline"}
            onClick={() => setFilter('past')}
          >
            Past
          </Button>
          <Button 
            variant={filter === 'all' ? "default" : "outline"}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Meetings</CardTitle>
          <CardDescription>
            {bookings?.length || 0} {filter} bookings found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !bookings || bookings.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No bookings found for the selected period.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Meeting Type</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 font-medium">
                          <Calendar className="h-4 w-4 text-violet-500" />
                          {format(new Date(booking.startTime), "MMM d, yyyy")}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(booking.startTime), "h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{booking.guestName}</span>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {booking.guestEmail}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                        {booking.bookingType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                          {booking.hostName.charAt(0)}
                        </div>
                        <span className="text-sm">{booking.hostName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {booking.status === 'confirmed' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                          Confirmed
                        </Badge>
                      ) : (
                        <Badge variant="outline">{booking.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {booking.meetingUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={booking.meetingUrl} target="_blank" rel="noopener noreferrer">
                            <Video className="h-4 w-4 mr-2" />
                            Join
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
