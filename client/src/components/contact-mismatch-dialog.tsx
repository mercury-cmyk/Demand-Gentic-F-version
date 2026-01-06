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

type CreateContactFormData = z.infer<typeof createContactSchema>;

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
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch contacts in the same account
  const { data: accountContacts = [], isLoading: loadingContacts } = useQuery<Contact[]>({
    queryKey: [`/api/accounts/${currentContact.accountId}/contacts`],
    enabled: open && mode === 'select',
  });

  const form = useForm<CreateContactFormData>({
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Wrong Person Answered
          </DialogTitle>
          <DialogDescription>
            You called <strong>{currentContact.fullName}</strong> but someone else answered.
            Select an existing contact from <strong>{currentContact.accountName}</strong> or create a new one.
          </DialogDescription>
        </DialogHeader>

        {mode === 'select' ? (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search existing contacts by name, email, or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-contacts"
              />
            </div>

            {/* Existing Contacts List */}
            <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-3">
              {loadingContacts ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  Loading contacts...
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No other contacts found in this account.
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <Card
                    key={contact.id}
                    className="p-3 cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => handleSelectContact(contact.id)}
                    data-testid={`contact-card-${contact.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="font-medium text-sm">{contact.fullName}</div>
                        {contact.jobTitle && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Briefcase className="h-3 w-3" />
                            {contact.jobTitle}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </div>
                        {contact.directPhone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {contact.directPhone}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Select
                      </Badge>
                    </div>
                  </Card>
                ))
              )}
            </div>

            {/* Create New Contact Button */}
            <div className="flex items-center justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setMode('create')}
                className="w-full"
                data-testid="button-create-new-contact"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Contact in {currentContact.accountName}
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
                Cancel
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateContact)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane" {...field} data-testid="input-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} data-testid="input-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Chief Technology Officer" {...field} data-testid="input-job-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="jane.doe@company.com"
                        {...field}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="directPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direct Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        {...field}
                        data-testid="input-direct-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode('select');
                    form.reset();
                  }}
                  data-testid="button-back"
                >
                  Back to List
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createMutation.isPending ? "Creating..." : "Create & Switch"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
