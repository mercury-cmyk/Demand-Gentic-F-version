import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Plus, Search, Mail, Briefcase, Phone } from "lucide-react";

const createContactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  title: z.string().min(1, "Job title is required"),
  email: z.string().email("Invalid email address"),
  directPhone: z.string().optional(),
});

type CreateContactFormData = z.infer;

type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string;
  jobTitle: string | null;
  directPhone: string | null;
};

interface ContactMismatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callAttemptId: string;
  currentContact: {
    id: string;
    fullName: string;
    accountId: string;
    accountName: string;
  };
  onContactSwitched: (newContact: { id: string; fullName: string }) => void;
}

export function ContactMismatchDialog({
  open,
  onOpenChange,
  callAttemptId,
  currentContact,
  onContactSwitched,
}: ContactMismatchDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState('select');
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch contacts in the same account
  const { data: accountContacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: [`/api/accounts/${currentContact.accountId}/contacts`],
    enabled: open && mode === 'select',
  });

  const form = useForm({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      title: "",
      email: "",
      directPhone: "",
    },
  });

  // Mutation for switching to existing contact
  const switchMutation = useMutation({
    mutationFn: async (newContactId: string) => {
      const res = await apiRequest("POST", `/api/call-attempts/${callAttemptId}/contact-switch`, {
        newContactId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate all queue queries (with or without campaign/status filters)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const firstKey = query.queryKey?.[0];
          if (!firstKey) return false;
          const keyString = `${firstKey}`;
          return keyString.startsWith('/api/agents/me/queue');
        }
      });
      const newContactName = accountContacts.find(c => c.id === data.attempt.actualContactId)?.fullName || 'Unknown';
      onContactSwitched({ id: data.attempt.actualContactId, fullName: newContactName });
      toast({
        title: "Contact Switched",
        description: `Successfully switched to ${newContactName}`,
      });
      onOpenChange(false);
      setMode('select');
      setSearchQuery("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to switch contact",
        variant: "destructive",
      });
    },
  });

  // Mutation for creating new contact and switching
  const createMutation = useMutation({
    mutationFn: async (data: CreateContactFormData) => {
      const res = await apiRequest("POST", `/api/call-attempts/${callAttemptId}/contact-switch`, {
        createContact: {
          ...data,
          accountId: currentContact.accountId,
        },
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate all queue queries (with or without campaign/status filters)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const firstKey = query.queryKey?.[0];
          if (!firstKey) return false;
          const keyString = `${firstKey}`;
          return keyString.startsWith('/api/agents/me/queue');
        }
      });
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${currentContact.accountId}/contacts`] });
      const newContactName = `${form.getValues('firstName')} ${form.getValues('lastName')}`;
      onContactSwitched({ id: data.attempt.actualContactId, fullName: newContactName });
      toast({
        title: "Contact Created",
        description: `Successfully created and switched to ${newContactName}`,
      });
      onOpenChange(false);
      form.reset();
      setMode('select');
      setSearchQuery("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contact",
        variant: "destructive",
      });
    },
  });

  const handleSelectContact = (contactId: string) => {
    if (contactId === currentContact.id) {
      toast({
        title: "Same Contact",
        description: "This is the contact you're already calling",
        variant: "destructive",
      });
      return;
    }
    switchMutation.mutate(contactId);
  };

  const handleCreateContact = (data: CreateContactFormData) => {
    createMutation.mutate(data);
  };

  const handleClose = () => {
    onOpenChange(false);
    setMode('select');
    setSearchQuery("");
    form.reset();
  };

  const filteredContacts = accountContacts.filter(contact =>
    contact.id !== currentContact.id && // Exclude current contact
    (searchQuery
      ? contact.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (contact.jobTitle?.toLowerCase().includes(searchQuery.toLowerCase()))
      : true)
  );

  return (
    
      
        
          
            
            Wrong Person Answered
          
          
            You called {currentContact.fullName} but someone else answered.
            Select an existing contact from {currentContact.accountName} or create a new one.
          
        

        {mode === 'select' ? (
          
            {/* Search Bar */}
            
              
               setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-contacts"
              />
            

            {/* Existing Contacts List */}
            
              {loadingContacts ? (
                
                  Loading contacts...
                
              ) : filteredContacts.length === 0 ? (
                
                  No other contacts found in this account.
                
              ) : (
                filteredContacts.map((contact) => (
                   handleSelectContact(contact.id)}
                    data-testid={`contact-card-${contact.id}`}
                  >
                    
                      
                        {contact.fullName}
                        {contact.jobTitle && (
                          
                            
                            {contact.jobTitle}
                          
                        )}
                        
                          
                          {contact.email}
                        
                        {contact.directPhone && (
                          
                            
                            {contact.directPhone}
                          
                        )}
                      
                      
                        Select
                      
                    
                  
                ))
              )}
            

            {/* Create New Contact Button */}
            
               setMode('create')}
                className="w-full"
                data-testid="button-create-new-contact"
              >
                
                Create New Contact in {currentContact.accountName}
              
            

            
              
                Cancel
              
            
          
        ) : (
          
            
              
                 (
                    
                      First Name
                      
                        
                      
                      
                    
                  )}
                />

                 (
                    
                      Last Name
                      
                        
                      
                      
                    
                  )}
                />
              

               (
                  
                    Job Title
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Email
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Direct Phone (Optional)
                    
                      
                    
                    
                  
                )}
              />

              
                 {
                    setMode('select');
                    form.reset();
                  }}
                  data-testid="button-back"
                >
                  Back to List
                
                
                  {createMutation.isPending ? "Creating..." : "Create & Switch"}
                
              
            
          
        )}
      
    
  );
}