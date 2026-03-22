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
  const [editProfile, setEditProfile] = useState(undefined);

  const { data: profiles = [], isLoading } = useQuery({
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
    if (isVerified === null) return ;
    return isVerified ? 
       : 
      ;
  };

  const getWarmupStatusBadge = (status: string | null) => {
    if (!status) return null;
    
    const variants: Record = {
      'not_started': 'secondary',
      'in_progress': 'default',
      'completed': 'outline',
      'paused': 'secondary',
    };
    
    return (
      
        {status.replace('_', ' ')}
      
    );
  };

  if (isLoading) {
    return (
      
        
          
          Sender Profiles
        
        Loading sender profiles...
      
    );
  }

  return (
    
      
        
          
          Sender Profiles
        
        
          
           setCreateDialogOpen(true)} data-testid="button-create-sender-profile">
            
            Create Sender Profile
          
        
      

      {profiles.length === 0 ? (
        
          
            
              
              No sender profiles yet
              
                Create your first sender profile to start sending emails
              
               setCreateDialogOpen(true)} data-testid="button-create-first-sender-profile">
                
                Create Sender Profile
              
            
          
        
      ) : (
        
          {profiles.map((profile) => (
            
              
                
                  
                    
                      {profile.name}
                      {profile.isDefault && (
                        
                          Default
                        
                      )}
                      {profile.warmupStatus && getWarmupStatusBadge(profile.warmupStatus)}
                    
                    
                      
                        From:
                        
                          {profile.fromName} &lt;{profile.fromEmail}&gt;
                        
                      
                      {profile.replyToEmail && (
                        
                          Reply-To:
                          
                            {profile.replyToEmail}
                          
                        
                      )}
                    
                  
                  
                     setEditProfile(profile)}
                      data-testid={`button-edit-${profile.id}`}
                    >
                      
                    
                     deleteMutation.mutate(profile.id)}
                      disabled={profile.isDefault || false}
                      data-testid={`button-delete-${profile.id}`}
                    >
                      
                    
                  
                
              
              
                
                  {profile.espProvider && (
                    
                      ESP Provider
                      
                        {profile.espProvider}
                      
                    
                  )}
                  
                    Email Verified
                    
                      {getStatusIcon(profile.isVerified)}
                      {profile.isVerified ? 'Verified' : profile.isVerified === false ? 'Not Verified' : 'Unknown'}
                    
                  
                  {profile.reputationScore !== null && (
                    
                      Reputation Score
                      
                        {profile.reputationScore}%
                      
                    
                  )}
                  
                    Created
                    
                      {format(new Date(profile.createdAt), "PP")}
                    
                  
                
              
            
          ))}
        
      )}

      
      
       !open && setEditProfile(undefined)}
        profile={editProfile}
      />
    
  );
}