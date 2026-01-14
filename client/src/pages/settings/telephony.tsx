/**
 * Telephony Settings Page
 *
 * SIP trunk configuration within the Settings Hub.
 * This page wraps the existing SIP trunk settings functionality.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSipTrunkConfigSchema } from "@shared/schema";
import { z } from "zod";
import { Phone, Plus, Trash2, Star, Power, Settings, Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SettingsLayout } from "@/components/settings/settings-layout";

type SipTrunkConfig = {
  id: string;
  name: string;
  provider: string;
  sipUsername: string;
  sipPassword: string;
  sipDomain?: string;
  connectionId?: string;
  callerIdNumber?: string;
  isDefault: boolean | null;
  isActive: boolean | null;
  createdAt: Date;
};

const formSchema = insertSipTrunkConfigSchema.extend({
  id: z.string().optional(),
  sipDomain: z
    .string()
    .trim()
    .min(1, "SIP domain is required")
    .refine(
      (value) => !value.includes("://") && !value.includes("/") && value.includes("."),
      "Enter a valid SIP domain (FQDN), e.g. sip.telnyx.com"
    ),
});

type FormData = z.infer<typeof formSchema>;

export default function TelephonySettingsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SipTrunkConfig | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch all SIP trunk configs
  const { data: configs = [], isLoading } = useQuery<SipTrunkConfig[]>({
    queryKey: ['/api/sip-trunks'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      provider: "telnyx",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      connectionId: "",
      callerIdNumber: "",
      isActive: true,
      isDefault: false,
    },
  });

  const providerValue = form.watch("provider");
  const sipDomainValue = form.watch("sipDomain");
  const isTelnyx = providerValue?.trim().toLowerCase() === "telnyx";

  useEffect(() => {
    if (!isTelnyx) return;
    if (!sipDomainValue || sipDomainValue === "sip.provider.com") {
      form.setValue("sipDomain", "sip.telnyx.com");
    }
  }, [form, isTelnyx, sipDomainValue]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (editingConfig) {
        return apiRequest('PATCH', `/api/sip-trunks/${editingConfig.id}`, data);
      } else {
        return apiRequest('POST', '/api/sip-trunks', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: editingConfig ? "Configuration updated" : "Configuration created",
        description: `SIP trunk configuration has been ${editingConfig ? 'updated' : 'created'} successfully.`,
      });
      setIsDialogOpen(false);
      setEditingConfig(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save SIP trunk configuration",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/sip-trunks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Configuration deleted",
        description: "SIP trunk configuration has been deleted successfully.",
      });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete SIP trunk configuration",
        variant: "destructive",
      });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/sip-trunks/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Default trunk set",
        description: "This SIP trunk is now the default for all agents.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set default SIP trunk",
        variant: "destructive",
      });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest('PATCH', `/api/sip-trunks/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Status updated",
        description: "SIP trunk status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update SIP trunk status",
        variant: "destructive",
      });
    },
  });

  // Import from environment mutation
  const importEnvMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/sip-trunks/import-env');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Import successful",
        description: "SIP trunk configuration imported from environment variables.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import from environment",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (config: SipTrunkConfig) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      provider: config.provider,
      sipUsername: config.sipUsername,
      sipPassword: config.sipPassword,
      sipDomain: config.sipDomain || "sip.telnyx.com",
      connectionId: config.connectionId || "",
      callerIdNumber: config.callerIdNumber || "",
      isActive: config.isActive ?? true,
      isDefault: config.isDefault ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingConfig(null);
    form.reset({
      name: "",
      provider: "telnyx",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      connectionId: "",
      callerIdNumber: "",
      isActive: true,
      isDefault: false,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  return (
    <SettingsLayout
      title="Telephony (SIP)"
      description="Configure SIP trunk connections for voice calling"
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button onClick={handleNew} data-testid="button-add-sip-trunk">
              <Plus className="mr-2 h-4 w-4" />
              Add SIP Trunk
            </Button>
            <Button
              variant="outline"
              onClick={() => importEnvMutation.mutate()}
              disabled={importEnvMutation.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Import from Environment
            </Button>
          </div>
        </div>

        {/* SIP Trunk List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              SIP Trunk Configurations
            </CardTitle>
            <CardDescription>
              Manage your SIP trunk connections for WebRTC calling
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading configurations...
              </div>
            ) : configs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No SIP trunk configurations found.</p>
                <p className="text-sm">Add a configuration or import from environment variables.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Caller ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {config.name}
                          {config.isDefault && (
                            <Badge variant="secondary">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{config.provider}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {config.sipDomain || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {config.callerIdNumber || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={config.isActive ?? true}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: config.id, isActive: checked })
                            }
                          />
                          <span className={config.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                            {config.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(config)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          {!config.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDefaultMutation.mutate(config.id)}
                              title="Set as default"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(config.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Supported Providers</CardTitle>
            <CardDescription>
              Compatible SIP trunk providers for voice calling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['Telnyx', 'Twilio', 'Bandwidth', 'Plivo', 'Vonage', 'SignalWire', 'Flowroute', 'Skyetel'].map(provider => (
                <div key={provider} className="p-3 border rounded-lg text-center">
                  <span className="font-medium">{provider}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? 'Edit SIP Trunk' : 'Add SIP Trunk'}
            </DialogTitle>
            <DialogDescription>
              Configure your SIP trunk connection details
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My SIP Trunk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <FormControl>
                      <Input placeholder="telnyx" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sipUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIP Username</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sipPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIP Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sipDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIP Domain</FormLabel>
                    <FormControl>
                      <Input placeholder="sip.telnyx.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="connectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection ID (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Provider-specific connection identifier
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="callerIdNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Caller ID Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="+1234567890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SIP Trunk Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the SIP trunk configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
