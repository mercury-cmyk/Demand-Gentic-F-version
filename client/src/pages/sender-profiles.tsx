import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Trash2, Edit, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { SenderProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { SenderProfileFormDialog } from "@/components/sender-profile-form-dialog";
import { DomainAuthDialog } from "@/components/domain-auth-dialog";

export default function SenderProfilesPage() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<SenderProfile | undefined>(undefined);

  const { data: profiles = [], isLoading } = useQuery<SenderProfile[]>({
    queryKey: ["/api/sender-profiles"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/sender-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-profiles"] });
      toast({
        title: "Sender Profile deleted",
        description: "The sender profile has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete sender profile.",
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (isVerified: boolean | null) => {
    if (isVerified === null) return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    return isVerified ? 
      <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
      <XCircle className="h-4 w-4 text-red-600" />;
  };

  const getWarmupStatusBadge = (status: string | null) => {
    if (!status) return null;
    
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'not_started': 'secondary',
      'in_progress': 'default',
      'completed': 'outline',
      'paused': 'secondary',
    };
    
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Mail className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Sender Profiles</h1>
        </div>
        <div className="text-muted-foreground">Loading sender profiles...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Sender Profiles</h1>
        </div>
        <div className="flex gap-2">
          <DomainAuthDialog />
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-sender-profile">
            <Plus className="h-4 w-4 mr-2" />
            Create Sender Profile
          </Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sender profiles yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first sender profile to start sending emails
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-sender-profile">
                <Plus className="h-4 w-4 mr-2" />
                Create Sender Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <Card key={profile.id} data-testid={`card-sender-profile-${profile.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle>{profile.name}</CardTitle>
                      {profile.isDefault && (
                        <Badge variant="default" data-testid={`badge-default-${profile.id}`}>
                          Default
                        </Badge>
                      )}
                      {profile.warmupStatus && getWarmupStatusBadge(profile.warmupStatus)}
                    </div>
                    <CardDescription className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">From:</span>
                        <span data-testid={`text-from-email-${profile.id}`}>
                          {profile.fromName} &lt;{profile.fromEmail}&gt;
                        </span>
                      </div>
                      {profile.replyToEmail && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Reply-To:</span>
                          <span data-testid={`text-reply-to-${profile.id}`}>
                            {profile.replyToEmail}
                          </span>
                        </div>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => setEditProfile(profile)}
                      data-testid={`button-edit-${profile.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(profile.id)}
                      disabled={profile.isDefault || false}
                      data-testid={`button-delete-${profile.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {profile.espProvider && (
                    <div>
                      <div className="text-muted-foreground mb-1">ESP Provider</div>
                      <div className="font-medium capitalize" data-testid={`text-esp-${profile.id}`}>
                        {profile.espProvider}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-muted-foreground mb-1">Email Verified</div>
                    <div className="flex items-center gap-2" data-testid={`status-verified-${profile.id}`}>
                      {getStatusIcon(profile.isVerified)}
                      <span>{profile.isVerified ? 'Verified' : profile.isVerified === false ? 'Not Verified' : 'Unknown'}</span>
                    </div>
                  </div>
                  {profile.reputationScore !== null && (
                    <div>
                      <div className="text-muted-foreground mb-1">Reputation Score</div>
                      <div className="font-medium" data-testid={`text-reputation-${profile.id}`}>
                        {profile.reputationScore}%
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-muted-foreground mb-1">Created</div>
                    <div data-testid={`text-created-${profile.id}`}>
                      {format(new Date(profile.createdAt), "PP")}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SenderProfileFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      
      <SenderProfileFormDialog
        open={!!editProfile}
        onOpenChange={(open: boolean) => !open && setEditProfile(undefined)}
        profile={editProfile}
      />
    </div>
  );
}
