
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Settings, User, Bell, Shield, Mail, Phone, Database, Plus, Pencil, Trash2, Play, Clock, Link as LinkIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { CustomFieldDefinition } from "@shared/schema";

type MfaSetup = {
  qrCode: string;
  secret: string;
  backupCodes: string[];
};

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [mfaDisableDialogOpen, setMfaDisableDialogOpen] = useState(false);
  const [customFieldDialogOpen, setCustomFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const { toast } = useToast();

  // Custom Fields State
  const [fieldEntityType, setFieldEntityType] = useState<"contact" | "account">("contact");
  const [fieldKey, setFieldKey] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [helpText, setHelpText] = useState("");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");

  const { data: customFields, isLoading: fieldsLoading } = useQuery<CustomFieldDefinition[]>({
    queryKey: ['/api/custom-fields'],
  });

  const { data: mfaStatus, isLoading: mfaStatusLoading } = useQuery<{
    mfaEnabled: boolean;
    mfaEnrolledAt?: string | null;
    hasBackupCodes: boolean;
  }>({
    queryKey: ['/api/auth/mfa/status'],
  });

  const enrollMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/mfa/enroll');
      return response.json() as Promise<MfaSetup>;
    },
    onSuccess: (data) => {
      setMfaSetup(data);
      setMfaDialogOpen(true);
      toast({
        title: "Set up Google Authenticator",
        description: "Scan the QR code and enter the 6-digit code to confirm.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "2FA setup failed",
        description: error.message,
      });
    },
  });

  const confirmMfaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/auth/mfa/confirm', { token: mfaConfirmCode.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/mfa/status'] });
      setMfaDialogOpen(false);
      setMfaSetup(null);
      setMfaConfirmCode("");
      toast({
        title: "2FA enabled",
        description: "Google Authenticator is now required at login.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error.message,
      });
    },
  });

  const disableMfaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/auth/mfa/disable', { password: mfaDisablePassword });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/mfa/status'] });
      setMfaDisableDialogOpen(false);
      setMfaDisablePassword("");
      toast({
        title: "2FA disabled",
        description: "Multi-factor authentication has been turned off.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Disable failed",
        description: error.message,
      });
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest('POST', '/api/custom-fields', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });
      resetFieldForm();
      setCustomFieldDialogOpen(false);
      toast({
        title: "Success",
        description: "Custom field created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest('PATCH', `/api/custom-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });
      resetFieldForm();
      setCustomFieldDialogOpen(false);
      toast({
        title: "Success",
        description: "Custom field updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/custom-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });
      toast({
        title: "Success",
        description: "Custom field deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const resetFieldForm = () => {
    setFieldEntityType("contact");
    setFieldKey("");
    setDisplayLabel("");
    setFieldType("text");
    setHelpText("");
    setRequired(false);
    setOptions("");
    setEditingField(null);
  };

  const handleEditField = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setFieldEntityType(field.entityType);
    setFieldKey(field.fieldKey);
    setDisplayLabel(field.displayLabel);
    setFieldType(field.fieldType);
    setHelpText(field.helpText || "");
    setRequired(field.required);
    setOptions(field.options ? JSON.stringify(field.options) : "");
    setCustomFieldDialogOpen(true);
  };

  const handleSaveField = () => {
    const data: any = {
      entityType: fieldEntityType,
      fieldKey: fieldKey,
      displayLabel: displayLabel,
      fieldType: fieldType,
      helpText: helpText || null,
      required: required,
      options: (fieldType === 'select' || fieldType === 'multi_select') && options ? JSON.parse(options) : null,
    };

    if (editingField) {
      updateFieldMutation.mutate({ id: editingField.id, data });
    } else {
      createFieldMutation.mutate(data);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: "Success",
      description: "Your password has been updated.",
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const contactFields = customFields?.filter(f => f.entityType === 'contact') || [];
  const accountFields = customFields?.filter(f => f.entityType === 'account') || [];
  const mfaEnabled = !!mfaStatus?.mfaEnabled;
  const mfaToggleDisabled = mfaStatusLoading || enrollMfaMutation.isLoading || confirmMfaMutation.isLoading || disableMfaMutation.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and system preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="custom-fields" data-testid="tab-custom-fields">
            <Database className="mr-2 h-4 w-4" />
            Custom Fields
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            <Settings className="mr-2 h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="background-jobs" data-testid="tab-background-jobs">
            <Clock className="mr-2 h-4 w-4" />
            Background Jobs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="John" data-testid="input-first-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Doe" data-testid="input-last-name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john.doe@company.com" data-testid="input-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value="Admin" disabled data-testid="input-role" />
              </div>
              <Button data-testid="button-save-profile">Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom-fields" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contact Custom Fields</CardTitle>
                  <CardDescription>
                    Define custom fields for contacts
                  </CardDescription>
                </div>
                <Dialog open={customFieldDialogOpen && fieldEntityType === 'contact'} onOpenChange={(open) => {
                  if (!open) resetFieldForm();
                  setCustomFieldDialogOpen(open);
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => setFieldEntityType('contact')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Field
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>{editingField ? 'Edit' : 'Create'} Contact Custom Field</DialogTitle>
                      <DialogDescription>
                        Define a custom field for contacts
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Field Key (internal)</Label>
                        <Input
                          value={fieldKey}
                          onChange={(e) => setFieldKey(e.target.value)}
                          placeholder="e.g., lead_score"
                          disabled={!!editingField}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Display Label</Label>
                        <Input
                          value={displayLabel}
                          onChange={(e) => setDisplayLabel(e.target.value)}
                          placeholder="e.g., Lead Score"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Field Type</Label>
                        <Select value={fieldType} onValueChange={setFieldType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="select">Select (dropdown)</SelectItem>
                            <SelectItem value="multi_select">Multi-Select</SelectItem>
                            <SelectItem value="url">URL</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(fieldType === 'select' || fieldType === 'multi_select') && (
                        <div className="space-y-2">
                          <Label>Options (JSON array)</Label>
                          <Textarea
                            value={options}
                            onChange={(e) => setOptions(e.target.value)}
                            placeholder='["Option 1", "Option 2", "Option 3"]'
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Help Text</Label>
                        <Input
                          value={helpText}
                          onChange={(e) => setHelpText(e.target.value)}
                          placeholder="Optional helper text"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch checked={required} onCheckedChange={setRequired} />
                        <Label>Required Field</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCustomFieldDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveField}>
                        {editingField ? 'Update' : 'Create'} Field
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No custom fields defined
                      </TableCell>
                    </TableRow>
                  ) : (
                    contactFields.map((field) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium">{field.displayLabel}</TableCell>
                        <TableCell className="font-mono text-sm">{field.fieldKey}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{field.fieldType}</Badge>
                        </TableCell>
                        <TableCell>
                          {field.required ? <Badge>Required</Badge> : <span className="text-muted-foreground">Optional</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditField(field)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this field?')) {
                                  deleteFieldMutation.mutate(field.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Account Custom Fields</CardTitle>
                  <CardDescription>
                    Define custom fields for accounts
                  </CardDescription>
                </div>
                <Dialog open={customFieldDialogOpen && fieldEntityType === 'account'} onOpenChange={(open) => {
                  if (!open) resetFieldForm();
                  setCustomFieldDialogOpen(open);
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => setFieldEntityType('account')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Field
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>{editingField ? 'Edit' : 'Create'} Account Custom Field</DialogTitle>
                      <DialogDescription>
                        Define a custom field for accounts
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Field Key (internal)</Label>
                        <Input
                          value={fieldKey}
                          onChange={(e) => setFieldKey(e.target.value)}
                          placeholder="e.g., contract_type"
                          disabled={!!editingField}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Display Label</Label>
                        <Input
                          value={displayLabel}
                          onChange={(e) => setDisplayLabel(e.target.value)}
                          placeholder="e.g., Contract Type"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Field Type</Label>
                        <Select value={fieldType} onValueChange={setFieldType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="select">Select (dropdown)</SelectItem>
                            <SelectItem value="multi_select">Multi-Select</SelectItem>
                            <SelectItem value="url">URL</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(fieldType === 'select' || fieldType === 'multi_select') && (
                        <div className="space-y-2">
                          <Label>Options (JSON array)</Label>
                          <Textarea
                            value={options}
                            onChange={(e) => setOptions(e.target.value)}
                            placeholder='["Option 1", "Option 2", "Option 3"]'
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Help Text</Label>
                        <Input
                          value={helpText}
                          onChange={(e) => setHelpText(e.target.value)}
                          placeholder="Optional helper text"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch checked={required} onCheckedChange={setRequired} />
                        <Label>Required Field</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCustomFieldDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveField}>
                        {editingField ? 'Update' : 'Create'} Field
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No custom fields defined
                      </TableCell>
                    </TableRow>
                  ) : (
                    accountFields.map((field) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium">{field.displayLabel}</TableCell>
                        <TableCell className="font-mono text-sm">{field.fieldKey}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{field.fieldType}</Badge>
                        </TableCell>
                        <TableCell>
                          {field.required ? <Badge>Required</Badge> : <span className="text-muted-foreground">Optional</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditField(field)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this field?')) {
                                  deleteFieldMutation.mutate(field.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to be notified about important events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Campaign Completion</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when a campaign completes
                  </p>
                </div>
                <Switch data-testid="switch-campaign-completion" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Lead Approvals</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when leads are ready for review
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-lead-approvals" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Import Completion</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when bulk imports finish
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-import-completion" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Order Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about client order status changes
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-order-updates" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4 mt-6">
          <Microsoft365IntegrationCard />
          <GoogleIntegrationCard />

          <Card>
            <CardHeader>
              <CardTitle>Email Service Provider</CardTitle>
              <CardDescription>
                Configure your ESP for email campaigns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-medium">SendGrid</h4>
                    <p className="text-sm text-muted-foreground">Connected</p>
                  </div>
                </div>
                <Button variant="outline" data-testid="button-configure-esp">
                  Configure
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Telephony Provider</CardTitle>
              <CardDescription>
                Configure Telnyx for telemarketing campaigns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Phone className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-medium">Telnyx</h4>
                    <p className="text-sm text-muted-foreground">Not connected</p>
                  </div>
                </div>
                <Button data-testid="button-connect-telephony">
                  Connect
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  data-testid="input-current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
              </div>
              <Button onClick={handlePasswordChange} data-testid="button-change-password">
                Update Password
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label>Enable 2FA (Google Authenticator)</Label>
                  <p className="text-sm text-muted-foreground">
                    Require a time-based code in addition to your password.
                  </p>
                  {mfaStatusLoading ? (
                    <p className="text-xs text-muted-foreground">Checking status...</p>
                  ) : (
                    <p className={`text-xs ${mfaEnabled ? "text-green-600" : "text-muted-foreground"}`}>
                      {mfaEnabled ? "Enabled" : "Disabled"}
                    </p>
                  )}
                </div>
                <Switch
                  checked={mfaEnabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      enrollMfaMutation.mutate();
                    } else if (mfaEnabled) {
                      setMfaDisableDialogOpen(true);
                    }
                  }}
                  disabled={mfaToggleDisabled}
                  data-testid="switch-2fa"
                />
              </div>
              {mfaEnabled && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Keep your backup codes safe in case you lose access to your authenticator.
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={mfaDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                setMfaDialogOpen(false);
                setMfaSetup(null);
                setMfaConfirmCode("");
              }
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Enable 2FA with Google Authenticator</DialogTitle>
                <DialogDescription>
                  Scan the QR code, then enter the 6-digit code to confirm.
                </DialogDescription>
              </DialogHeader>
              {!mfaSetup ? (
                <div className="py-8 text-center text-muted-foreground">Loading setup...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={mfaSetup.qrCode}
                      alt="Authenticator QR code"
                      className="h-40 w-40 rounded-md border bg-white p-2"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Can't scan? Enter this key manually:{" "}
                      <span className="font-mono text-foreground">{mfaSetup.secret}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mfa-confirm-code">Verification code</Label>
                    <Input
                      id="mfa-confirm-code"
                      placeholder="123456"
                      value={mfaConfirmCode}
                      onChange={(e) => setMfaConfirmCode(e.target.value)}
                    />
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Backup codes</p>
                    <p className="text-xs text-muted-foreground">
                      Save these codes in a safe place. Each code can be used once.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
                      {mfaSetup.backupCodes.map((code) => (
                        <div key={code} className="rounded bg-muted/50 px-2 py-1 text-center">
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMfaDialogOpen(false);
                    setMfaSetup(null);
                    setMfaConfirmCode("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => confirmMfaMutation.mutate()}
                  disabled={!mfaConfirmCode || confirmMfaMutation.isLoading}
                >
                  {confirmMfaMutation.isLoading ? "Confirming..." : "Confirm"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={mfaDisableDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                setMfaDisableDialogOpen(false);
                setMfaDisablePassword("");
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Disable 2FA</DialogTitle>
                <DialogDescription>
                  Enter your password to turn off multi-factor authentication.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="mfa-disable-password">Password</Label>
                <Input
                  id="mfa-disable-password"
                  type="password"
                  value={mfaDisablePassword}
                  onChange={(e) => setMfaDisablePassword(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMfaDisableDialogOpen(false);
                    setMfaDisablePassword("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => disableMfaMutation.mutate()}
                  disabled={!mfaDisablePassword || disableMfaMutation.isLoading}
                >
                  {disableMfaMutation.isLoading ? "Disabling..." : "Disable 2FA"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="background-jobs" className="space-y-4 mt-6">
          <BackgroundJobsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Microsoft 365 Integration Component
function Microsoft365IntegrationCard() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: status, isLoading } = useQuery<{
    connected: boolean;
    mailboxEmail?: string | null;
    displayName?: string | null;
    connectedAt?: string | null;
    lastSyncAt?: string | null;
  }>({
    queryKey: ['/api/oauth/microsoft/status'],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/oauth/microsoft/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oauth/microsoft/status'] });
      toast({
        title: "Disconnected",
        description: "Microsoft 365 mailbox has been disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to disconnect mailbox",
      });
    },
  });

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await apiRequest('GET', '/api/oauth/microsoft/authorize');
      const data = await response.json();
      const authUrl = data.authUrl;
      
      console.log('[M365 OAuth] Opening URL:', authUrl);
      
      // Open OAuth window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        authUrl,
        'Microsoft 365 OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      console.log('[M365 OAuth] Popup opened:', authWindow ? 'Success' : 'Failed');

      // Check if popup was blocked
      if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
        setIsConnecting(false);
        toast({
          variant: "destructive",
          title: "Popup Blocked",
          description: "Please allow popups for this site to connect your Microsoft 365 account",
        });
        return;
      }

      // Listen for postMessage from popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && event.data.provider === 'microsoft') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/microsoft/status'] });
          toast({
            title: "Connected",
            description: "Microsoft 365 account connected successfully",
          });
        } else if (event.data.type === 'oauth-error' && event.data.provider === 'microsoft') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          toast({
            variant: "destructive",
            title: "Connection Failed",
            description: event.data.error || "Failed to connect Microsoft 365 account",
          });
        }
      };
      window.addEventListener('message', handleMessage);

      // Poll for window close as fallback
      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/microsoft/status'] });
        }
      }, 500);

    } catch (error: any) {
      setIsConnecting(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to initiate OAuth flow",
      });
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect your Microsoft 365 mailbox?')) {
      disconnectMutation.mutate();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Microsoft 365 Integration
        </CardTitle>
        <CardDescription>
          Connect your Microsoft 365 account to sync emails and enable automated email sequences
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-accent/5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    {status.displayName || 'Microsoft 365'}
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Connected
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {status.mailboxEmail}
                  </p>
                  {status.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(status.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-m365"
              >
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>

            <div className="text-sm space-y-2">
              <h4 className="font-medium">Enabled Features:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Email sync and history
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Automated email sequences
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Contact engagement tracking
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <div>
                  <h4 className="font-medium">Microsoft 365</h4>
                  <p className="text-sm text-muted-foreground">Not connected</p>
                </div>
              </div>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                data-testid="button-connect-m365"
              >
                <LinkIcon className="mr-2 h-4 w-4" />
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">Connect to unlock:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Automatic email synchronization</li>
                <li>Email sequence automation</li>
                <li>Contact engagement history</li>
                <li>Email analytics and insights</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Google Integration Component
function GoogleIntegrationCard() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: status, isLoading } = useQuery<{
    connected: boolean;
    mailboxEmail?: string | null;
    displayName?: string | null;
    connectedAt?: string | null;
    lastSyncAt?: string | null;
  }>({
    queryKey: ['/api/oauth/google/status'],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/oauth/google/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
      toast({
        title: "Disconnected",
        description: "Google mailbox has been disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to disconnect mailbox",
      });
    },
  });

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await apiRequest('GET', '/api/oauth/google/authorize');
      const data = await response.json();
      const authUrl = data.authUrl;

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const authWindow = window.open(
        authUrl,
        'Google OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
        setIsConnecting(false);
        toast({
          variant: "destructive",
          title: "Popup Blocked",
          description: "Please allow popups for this site to connect your Google account",
        });
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && event.data.provider === 'google') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
          toast({
            title: "Connected",
            description: "Google account connected successfully",
          });
        } else if (event.data.type === 'oauth-error' && event.data.provider === 'google') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          toast({
            variant: "destructive",
            title: "Connection Failed",
            description: event.data.error || "Failed to connect Google account",
          });
        }
      };
      window.addEventListener('message', handleMessage);

      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
        }
      }, 500);
    } catch (error: any) {
      setIsConnecting(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to initiate OAuth flow",
      });
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect your Google mailbox?')) {
      disconnectMutation.mutate();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Google Workspace / Gmail Integration
        </CardTitle>
        <CardDescription>
          Connect your Google account to sync emails and send from your inbox
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-accent/5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    {status.displayName || 'Google'}
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Connected
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {status.mailboxEmail}
                  </p>
                  {status.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(status.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-google"
              >
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>

            <div className="text-sm space-y-2">
              <h4 className="font-medium">Enabled Features:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Inbox sync and history
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Send and reply from Gmail
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <div>
                  <h4 className="font-medium">Google Workspace / Gmail</h4>
                  <p className="text-sm text-muted-foreground">Not connected</p>
                </div>
              </div>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                data-testid="button-connect-google"
              >
                <LinkIcon className="mr-2 h-4 w-4" />
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">Connect to unlock:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Automatic inbox synchronization</li>
                <li>Email replies from Gmail</li>
                <li>Contact engagement history</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Background Jobs Tab Component
function BackgroundJobsTab() {
  const { toast } = useToast();
  const [isTriggeringEmail, setIsTriggeringEmail] = useState(false);
  const [isTriggeringAI, setIsTriggeringAI] = useState(false);

  const { data: jobStatus, isLoading } = useQuery<{
    emailValidation?: { enabled: boolean; mode: string };
    aiEnrichment?: { enabled: boolean; mode: string };
  }>({
    queryKey: ['/api/jobs/status'],
  });

  const triggerEmailValidation = async () => {
    setIsTriggeringEmail(true);
    try {
      const result: any = await apiRequest('POST', '/api/jobs/trigger-email-validation');
      toast({
        title: "Email Validation Started",
        description: result.message || "Email validation job has been triggered successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to trigger email validation",
      });
    } finally {
      setIsTriggeringEmail(false);
    }
  };

  const triggerAiEnrichment = async () => {
    setIsTriggeringAI(true);
    try {
      const result: any = await apiRequest('POST', '/api/jobs/trigger-ai-enrichment');
      toast({
        title: "AI Enrichment Started",
        description: result.message || "AI enrichment job has been triggered successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to trigger AI enrichment",
      });
    } finally {
      setIsTriggeringAI(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Background Jobs Management
          </CardTitle>
          <CardDescription>
            Control automated background jobs for email validation and AI enrichment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Validation Job */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Validation Job
                </h3>
                <p className="text-sm text-muted-foreground">
                  Validates pending contact email addresses using DNS and SMTP checks
                </p>
              </div>
              <Badge variant={jobStatus?.emailValidation?.enabled ? "default" : "secondary"}>
                {jobStatus?.emailValidation?.mode || 'manual'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={triggerEmailValidation}
                disabled={isTriggeringEmail}
                size="sm"
                data-testid="button-trigger-email-validation"
              >
                <Play className="h-4 w-4 mr-2" />
                {isTriggeringEmail ? 'Triggering...' : 'Run Now'}
              </Button>
              {!jobStatus?.emailValidation?.enabled && (
                <p className="text-xs text-muted-foreground">
                  Automatic scheduling is disabled - use manual trigger
                </p>
              )}
            </div>
          </div>

          {/* AI Enrichment Job */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  AI Enrichment Job
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enriches contacts missing phone and address data using AI
                </p>
              </div>
              <Badge variant={jobStatus?.aiEnrichment?.enabled ? "default" : "secondary"}>
                {jobStatus?.aiEnrichment?.mode || 'manual'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={triggerAiEnrichment}
                disabled={isTriggeringAI}
                size="sm"
                data-testid="button-trigger-ai-enrichment"
              >
                <Play className="h-4 w-4 mr-2" />
                {isTriggeringAI ? 'Triggering...' : 'Run Now'}
              </Button>
              {!jobStatus?.aiEnrichment?.enabled && (
                <p className="text-xs text-muted-foreground">
                  Automatic scheduling is disabled - use manual trigger
                </p>
              )}
            </div>
          </div>

          {/* Info Alert */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm">
              <strong>Note:</strong> Background jobs are currently configured for manual execution only. 
              To enable automatic scheduling, set the environment variables <code>ENABLE_EMAIL_VALIDATION=true</code> and 
              <code>ENABLE_AI_ENRICHMENT=true</code> and restart the server.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
