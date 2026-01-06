import { useState } from "react";
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
import { Phone, Plus, Trash2, Star, Power, Settings } from "lucide-react";
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

type SipTrunkConfig = {
  id: string;
  name: string;
  sipUsername: string;
  sipPassword: string;
  sipDomain?: string;
  isDefault: boolean | null;
  isActive: boolean | null;
  createdAt: Date;
};

const formSchema = insertSipTrunkConfigSchema.extend({
  id: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function SipTrunkSettingsPage() {
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
      isActive: true,
      isDefault: false,
    },
  });

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
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (config: SipTrunkConfig) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      sipUsername: config.sipUsername,
      sipPassword: config.sipPassword,
      sipDomain: config.sipDomain || "sip.telnyx.com",
      isActive: config.isActive ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingConfig(null);
    form.reset({
      name: "",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-8 w-8" />
            Telephony Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage SIP trunk configurations for Telnyx WebRTC telephony integration
          </p>
        </div>
        <Button onClick={handleCreate} data-testid="button-add-trunk">
          <Plus className="h-4 w-4 mr-2" />
          Add SIP Trunk
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SIP Trunk Configurations</CardTitle>
          <CardDescription>
            Configure Telnyx SIP trunks for browser-based calling in the Agent Console
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading configurations...
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No SIP trunk configurations found</p>
              <p className="text-sm mt-2">Add your first Telnyx SIP trunk to enable calling</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connection Name</TableHead>
                  <TableHead>SIP Username</TableHead>
                  <TableHead>SIP Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id} data-testid={`row-trunk-${config.id}`}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="font-mono text-sm">{config.sipUsername}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {config.sipDomain || 'sip.telnyx.com'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.isActive ?? false}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: config.id, isActive: checked })
                          }
                          data-testid={`switch-active-${config.id}`}
                        />
                        <Badge variant={config.isActive ? "default" : "secondary"}>
                          {config.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {config.isDefault ? (
                        <Badge variant="outline" className="gap-1">
                          <Star className="h-3 w-3 fill-current" />
                          Default
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(config.id)}
                          data-testid={`button-set-default-${config.id}`}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(config)}
                          data-testid={`button-edit-${config.id}`}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(config.id)}
                          disabled={config.isDefault ?? false}
                          data-testid={`button-delete-${config.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? "Edit SIP Trunk Configuration" : "Add SIP Trunk Configuration"}
            </DialogTitle>
            <DialogDescription>
              Configure Telnyx SIP credentials for WebRTC calling
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Telnyx Primary Trunk"
                        data-testid="input-connection-name"
                      />
                    </FormControl>
                    <FormDescription>
                      A friendly name to identify this SIP trunk configuration
                    </FormDescription>
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
                      <Input
                        {...field}
                        placeholder="Your Telnyx SIP username"
                        className="font-mono"
                        data-testid="input-sip-username"
                      />
                    </FormControl>
                    <FormDescription>
                      The SIP username from your Telnyx account
                    </FormDescription>
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
                      <Input
                        {...field}
                        type="password"
                        placeholder="Your Telnyx SIP password"
                        className="font-mono"
                        data-testid="input-sip-password"
                      />
                    </FormControl>
                    <FormDescription>
                      The SIP password from your Telnyx account
                    </FormDescription>
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
                      <Input
                        {...field}
                        placeholder="sip.telnyx.com"
                        className="font-mono"
                        data-testid="input-sip-domain"
                      />
                    </FormControl>
                    <FormDescription>
                      The Telnyx SIP domain (usually sip.telnyx.com)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable this SIP trunk for use in the Agent Console
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingConfig(null);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-save"
                >
                  {saveMutation.isPending ? "Saving..." : editingConfig ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SIP Trunk Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this SIP trunk configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
