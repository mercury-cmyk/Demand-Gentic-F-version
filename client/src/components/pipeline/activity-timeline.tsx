import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Activity, Plus, MessageSquare, Mail, PhoneCall, Calendar,
  TrendingUp, CheckCircle, Clock, FileText, Zap, User
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DealActivity {
  id: string;
  opportunityId: string;
  activityType: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  title: string;
  description?: string | null;
  metadata?: Record<string, any> | null;
  sourceReference?: string | null;
  createdAt: string;
}

const activitySchema = z.object({
  activityType: z.enum(['email_received', 'email_sent', 'meeting_scheduled', 'meeting_completed', 'call_completed', 'note_added', 'document_shared', 'proposal_sent', 'contract_sent', 'stage_changed', 'score_updated', 'lead_captured']),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activitySchema>;

interface ActivityTimelineProps {
  opportunityId: string;
  activities: DealActivity[];
  isLoading: boolean;
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'note_added':
      return MessageSquare;
    case 'email_sent':
    case 'email_received':
      return Mail;
    case 'call_completed':
      return PhoneCall;
    case 'meeting_scheduled':
    case 'meeting_completed':
      return Calendar;
    case 'stage_changed':
      return TrendingUp;
    case 'score_updated':
      return Zap;
    case 'lead_captured':
      return FileText;
    case 'document_shared':
      return FileText;
    case 'proposal_sent':
    case 'contract_sent':
      return FileText;
    default:
      return Activity;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'note_added':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
    case 'email_sent':
    case 'email_received':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
    case 'call_completed':
      return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
    case 'meeting_scheduled':
    case 'meeting_completed':
      return 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
    case 'stage_changed':
      return 'bg-teal-100 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400';
    case 'score_updated':
      return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
    case 'lead_captured':
      return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400';
    case 'document_shared':
      return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400';
    case 'proposal_sent':
    case 'contract_sent':
      return 'bg-pink-100 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400';
  }
};

const getActivityLabel = (type: string) => {
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

export function ActivityTimeline({ opportunityId, activities, isLoading }: ActivityTimelineProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      activityType: 'note_added',
      title: '',
      description: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ActivityFormData) => {
      return await apiRequest("POST", `/api/opportunities/${opportunityId}/activities`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/activities`] });
      toast({
        title: "Activity logged",
        description: "Activity has been added to the timeline",
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log activity",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ActivityFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Timeline
            </CardTitle>
            <CardDescription>
              Communication history and engagement tracking
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-activity">
                <Plus className="h-4 w-4 mr-2" />
                Log Activity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Activity</DialogTitle>
                <DialogDescription>
                  Add a new activity to the opportunity timeline
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="activityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Activity Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-activity-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="note_added">Note</SelectItem>
                            <SelectItem value="email_sent">Email Sent</SelectItem>
                            <SelectItem value="email_received">Email Received</SelectItem>
                            <SelectItem value="call_completed">Call</SelectItem>
                            <SelectItem value="meeting_scheduled">Meeting Scheduled</SelectItem>
                            <SelectItem value="meeting_completed">Meeting Completed</SelectItem>
                            <SelectItem value="document_shared">Document Shared</SelectItem>
                            <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
                            <SelectItem value="contract_sent">Contract Sent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Brief description of the activity"
                            {...field}
                            data-testid="input-activity-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Details (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional details..."
                            {...field}
                            data-testid="input-activity-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      data-testid="button-cancel-activity"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-activity">
                      Log Activity
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading activities...</div>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activities logged yet</p>
            <p className="text-sm mt-2">Click "Log Activity" to add your first entry</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.activityType);
                const colorClass = getActivityColor(activity.activityType);
                
                return (
                  <div
                    key={activity.id}
                    className="flex gap-4 p-4 rounded-lg border hover-elevate"
                    data-testid={`activity-${activity.id}`}
                  >
                    <div className="flex-shrink-0">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", colorClass)}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {getActivityLabel(activity.activityType)}
                            </Badge>
                          </div>
                          <h4 className="font-semibold text-sm" data-testid={`activity-title-${activity.id}`}>
                            {activity.title}
                          </h4>
                        </div>
                        <div className="flex-shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                      {activity.actorName && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <User className="h-3 w-3" />
                          <span>{activity.actorName}</span>
                        </div>
                      )}
                      {activity.description && (
                        <p className="text-sm text-muted-foreground">
                          {activity.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
