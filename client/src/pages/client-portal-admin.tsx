import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Users,
  Building2,
  FileText,
  Settings,
  Eye,
  UserPlus,
  Link as LinkIcon,
  DollarSign,
  CreditCard,
  Send,
  Download,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Network,
  ExternalLink,
  Mail,
  Phone,
  Database,
  Target,
  Copy,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { ClientAccount, VerificationCampaign } from '@shared/schema';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Components for Client Profile and Settings
const ClientProfileEditor = ({ client, onSave, isLoading }: { client: any; onSave: (data: any) => void; isLoading: boolean }) => {
  const [data, setData] = useState(client.profile || {});

  const handleChange = (field: string, value: any) => {
    setData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: string, value: string) => {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean);
    handleChange(field, arr);
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Business Summary</Label>
          <Textarea 
            value={data.summary || ''} 
            onChange={(e) => handleChange('summary', e.target.value)}
            placeholder="What does the client do?" 
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label>Problem Solved</Label>
          <Textarea 
            value={data.problemSolved || ''} 
            onChange={(e) => handleChange('problemSolved', e.target.value)}
            placeholder="What core problems do they solve?" 
             rows={3}
          />
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Target Audience</Label>
          <Input 
            value={data.targetAudience || ''} 
            onChange={(e) => handleChange('targetAudience', e.target.value)}
            placeholder="Who are they selling to?" 
          />
        </div>
        <div className="space-y-2">
          <Label>Engagement Model</Label>
          <Input 
            value={data.engagementModel || ''} 
            onChange={(e) => handleChange('engagementModel', e.target.value)}
            placeholder="How do we work with them?" 
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
            <Label>Products (comma separated)</Label>
            <Input 
                value={(data.products || []).join(', ')} 
                onChange={(e) => handleArrayChange('products', e.target.value)}
            />
        </div>
        <div className="space-y-2">
            <Label>Services (comma separated)</Label>
            <Input 
                value={(data.services || []).join(', ')} 
                onChange={(e) => handleArrayChange('services', e.target.value)}
            />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
            <Label>Industries (comma separated)</Label>
            <Input 
                value={(data.industries || []).join(', ')} 
                onChange={(e) => handleArrayChange('industries', e.target.value)}
            />
        </div>
         <div className="space-y-2">
            <Label>Key Differentiators</Label>
            <Textarea 
                value={data.differentiators || ''} 
                onChange={(e) => handleChange('differentiators', e.target.value)}
                placeholder="Why them?"
            />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
            <Label>Priorities (comma separated)</Label>
            <Input 
                value={(data.priorities || []).join(', ')} 
                onChange={(e) => handleArrayChange('priorities', e.target.value)}
            />
        </div>
        <div className="space-y-2">
            <Label>Constraints (comma separated)</Label>
            <Input 
                value={(data.constraints || []).join(', ')} 
                onChange={(e) => handleArrayChange('constraints', e.target.value)}
            />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave({ profile: data })} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Profile
        </Button>
      </div>
    </div>
  );
};

const ClientSettingsEditor = ({ client, onSave, isLoading }: { client: any; onSave: (data: any) => void; isLoading: boolean }) => {
  const [data, setData] = useState(client.settings || {});
  
  const handleChange = (field: string, value: any) => {
    setData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleFeatureToggle = (feature: string, enabled: boolean) => {
      setData((prev: any) => ({
          ...prev,
          featureVisibility: {
              ...(prev.featureVisibility || {}),
              [feature]: enabled
          }
      }));
  };

  const updateNestedJson = (field: string, key: string, value: any) => {
      try {
        const parsed = JSON.parse(value);
        setData((prev: any) => ({ ...prev, [field]: parsed }));
      } catch (e) {
        // invalid json, ignore
      }
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-4 border p-4 rounded-lg">
        <h4 className="font-medium">Feature Visibility</h4>
        <div className="grid grid-cols-2 gap-4">
            {['showBilling', 'showLeads', 'showRecordings', 'showProjectDetails'].map((feature) => (
                <div key={feature} className="flex items-center space-x-2">
                    <Switch 
                        checked={data.featureVisibility?.[feature] ?? client.visibilitySettings?.[feature] ?? true}
                        onCheckedChange={(checked) => handleFeatureToggle(feature, checked)}
                    />
                    <Label>{feature.replace(/([A-Z])/g, ' $1').trim()}</Label>
                </div>
            ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Default Campaign Types (comma separated)</Label>
        <Input 
            value={(data.defaultCampaignTypes || client.visibilitySettings?.allowedCampaignTypes || []).join(', ')} 
            onChange={(e) => handleChange('defaultCampaignTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>

       <div className="space-y-2">
        <Label>Preferred Workflows (comma separated)</Label>
        <Input 
            value={(data.preferredWorkflows || []).join(', ')} 
            onChange={(e) => handleChange('preferredWorkflows', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>

      <div className="space-y-2">
        <Label>Agent Defaults (JSON)</Label>
        <Textarea 
            defaultValue={JSON.stringify(data.agentDefaults || {}, null, 2)}
            onChange={(e) => updateNestedJson('agentDefaults', 'val', e.target.value)}
            className="font-mono text-sm"
            rows={5}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave({ settings: data })} disabled={isLoading}>
           {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
           Save Settings
        </Button>
      </div>
    </div>
  );
};

// Campaign Pricing Editor Component
const ClientCampaignPricingEditor = ({ clientId }: { clientId: string }) => {
  const { toast } = useToast();
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    pricePerLead: string;
    minimumOrderSize: number;
    isEnabled: boolean;
    notes: string;
  }>({ pricePerLead: '', minimumOrderSize: 100, isEnabled: true, notes: '' });

  // Fetch pricing data
  const { data: pricingData, isLoading, refetch } = useQuery({
    queryKey: ['client-campaign-pricing', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/billing/clients/${clientId}/campaign-pricing`);
      if (!res.ok) throw new Error('Failed to fetch pricing');
      return res.json();
    },
    enabled: !!clientId,
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async ({ campaignType, data }: { campaignType: string; data: any }) => {
      const res = await fetch(`/api/admin/billing/clients/${clientId}/campaign-pricing/${campaignType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update pricing');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Pricing updated successfully' });
      setEditingType(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update pricing', description: error.message, variant: 'destructive' });
    },
  });

  const handleEdit = (item: any) => {
    setEditingType(item.campaignType);
    setEditValues({
      pricePerLead: item.pricePerLead,
      minimumOrderSize: item.minimumOrderSize,
      isEnabled: item.isEnabled,
      notes: item.notes || '',
    });
  };

  const handleSave = () => {
    if (!editingType) return;
    updatePricingMutation.mutate({
      campaignType: editingType,
      data: {
        pricePerLead: editValues.pricePerLead,
        minimumOrderSize: editValues.minimumOrderSize,
        isEnabled: editValues.isEnabled,
        notes: editValues.notes || null,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Campaign Type Pricing
          </h3>
          <p className="text-sm text-muted-foreground">
            Set custom pricing for each campaign type. Unconfigured types use default pricing.
          </p>
        </div>
        <Badge variant="outline">
          {pricingData?.configuredCount || 0} / {pricingData?.totalCampaignTypes || 0} configured
        </Badge>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign Type</TableHead>
            <TableHead className="text-right">Price/Lead</TableHead>
            <TableHead className="text-right">Min Order</TableHead>
            <TableHead className="text-center">Enabled</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricingData?.pricing?.map((item: any) => (
            <TableRow key={item.campaignType} className={!item.isEnabled ? 'opacity-50' : ''}>
              <TableCell>
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.campaignType}</div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {editingType === item.campaignType ? (
                  <Input
                    type="number"
                    step="0.01"
                    className="w-24 text-right"
                    value={editValues.pricePerLead}
                    onChange={(e) => setEditValues(prev => ({ ...prev, pricePerLead: e.target.value }))}
                  />
                ) : (
                  <span className={item.isConfigured ? 'font-semibold text-primary' : ''}>
                    ${parseFloat(item.pricePerLead).toFixed(2)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {editingType === item.campaignType ? (
                  <Input
                    type="number"
                    className="w-20 text-right"
                    value={editValues.minimumOrderSize}
                    onChange={(e) => setEditValues(prev => ({ ...prev, minimumOrderSize: parseInt(e.target.value) || 100 }))}
                  />
                ) : (
                  <span>{item.minimumOrderSize}</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {editingType === item.campaignType ? (
                  <Switch
                    checked={editValues.isEnabled}
                    onCheckedChange={(checked) => setEditValues(prev => ({ ...prev, isEnabled: checked }))}
                  />
                ) : (
                  item.isEnabled ? (
                    <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500 mx-auto" />
                  )
                )}
              </TableCell>
              <TableCell>
                {editingType === item.campaignType ? (
                  <Input
                    placeholder="Internal notes..."
                    value={editValues.notes}
                    onChange={(e) => setEditValues(prev => ({ ...prev, notes: e.target.value }))}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">{item.notes || '-'}</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {editingType === item.campaignType ? (
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditingType(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={updatePricingMutation.isPending}>
                      {updatePricingMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                    Edit
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pricingData?.configuredCount === 0 && (
        <div className="text-center py-4 text-muted-foreground border-t">
          <p>No custom pricing configured. Click "Edit" to set client-specific prices.</p>
          <p className="text-sm">Current prices shown are system defaults.</p>
        </div>
      )}
    </div>
  );
};

// Pricing Documents Manager Component
const ClientPricingDocumentsManager = ({ clientId }: { clientId: string }) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [docName, setDocName] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: docsData, isLoading, refetch } = useQuery({
    queryKey: ['client-pricing-documents', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/billing/clients/${clientId}/pricing-documents`);
      if (!res.ok) throw new Error('Failed to fetch pricing documents');
      return res.json();
    },
    enabled: !!clientId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/admin/billing/clients/${clientId}/pricing-documents/${docId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete document');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Document removed' });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove document', description: error.message, variant: 'destructive' });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setDocName(file.name.replace(/\.[^.]+$/, ''));
    setShowUploadDialog(true);
  };

  const handleUpload = async () => {
    if (!pendingFile || !docName.trim()) return;

    setIsUploading(true);
    try {
      // Get presigned upload URL
      const urlRes = await fetch('/api/s3/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: pendingFile.name,
          contentType: pendingFile.type,
          folder: 'pricing-documents',
        }),
      });

      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { url, key } = await urlRes.json();

      // Upload file to GCS
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': pendingFile.type },
        body: pendingFile,
      });

      // Save document metadata
      const saveRes = await fetch(`/api/admin/billing/clients/${clientId}/pricing-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: docName.trim(),
          description: docDescription.trim() || null,
          fileKey: key,
          fileName: pendingFile.name,
          fileType: pendingFile.type,
          fileSize: pendingFile.size,
        }),
      });

      if (!saveRes.ok) throw new Error('Failed to save document');

      toast({ title: 'Pricing document uploaded successfully' });
      setShowUploadDialog(false);
      setPendingFile(null);
      setDocName('');
      setDocDescription('');
      refetch();
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (docId: string) => {
    try {
      const res = await fetch(`/api/admin/billing/clients/${clientId}/pricing-documents/${docId}/download`);
      if (!res.ok) throw new Error('Failed to get download URL');
      const { downloadUrl, fileName } = await res.json();
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast({ title: 'Download failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4 pt-6">
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Pricing Documents
          </h3>
          <p className="text-sm text-muted-foreground">
            Upload custom pricing agreements, rate cards, or contract documents. Clients can view and download these.
          </p>
        </div>
        <div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt"
            onChange={handleFileSelect}
            id={`pricing-doc-upload-${clientId}`}
          />
          <Button
            size="sm"
            onClick={() => document.getElementById(`pricing-doc-upload-${clientId}`)?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : docsData?.documents?.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docsData.documents.map((doc: any) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{doc.name}</div>
                    {doc.description && <div className="text-xs text-muted-foreground">{doc.description}</div>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {doc.fileName}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm">{formatFileSize(doc.fileSize)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(doc.createdAt).toLocaleDateString()}
                  {doc.uploadedBy && <span className="block text-xs">by {doc.uploadedBy}</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => handleDownload(doc.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center py-6 text-muted-foreground border rounded-lg">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No pricing documents uploaded yet.</p>
          <p className="text-sm">Upload rate cards, contracts, or pricing agreements.</p>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Pricing Document</DialogTitle>
            <DialogDescription>
              Add a name and optional description for this pricing document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g., Argyle Custom Pricing Q1 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                value={docDescription}
                onChange={(e) => setDocDescription(e.target.value)}
                placeholder="Brief description of the pricing agreement..."
                rows={3}
              />
            </div>
            {pendingFile && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
                <FileText className="h-4 w-4" />
                <span>{pendingFile.name}</span>
                <span className="text-muted-foreground">({formatFileSize(pendingFile.size)})</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); setPendingFile(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading || !docName.trim()}>
              {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface BillingConfig {
  clientAccountId: string;
  defaultBillingModel: string;
  defaultRatePerLead: string;
  defaultRatePerContact: string;
  defaultRatePerCallMinute: string;
  defaultRatePerEmail: string;
  monthlyRetainerAmount: string | null;
  retainerIncludesLeads: number | null;
  overageRatePerLead: string | null;
  paymentTermsDays: number;
  currency: string;
  billingEmail: string | null;
  taxExempt: boolean;
  taxId: string | null;
  taxRate: string;
  autoInvoiceEnabled: boolean;
  invoiceDayOfMonth: number;
  paymentDueDayOfMonth: number | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientAccountId: string;
  clientName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  void: 'bg-gray-100 text-gray-600',
};

export default function ClientPortalAdmin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('clients');
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showGrantAccess, setShowGrantAccess] = useState(false);
  const [showBillingConfig, setShowBillingConfig] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [clientDetail, setClientDetail] = useState<any>(null);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [grantAccessCampaignType, setGrantAccessCampaignType] = useState<'data' | 'regular'>('data');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [inviteDomainInput, setInviteDomainInput] = useState('');
  const [inviteEnabled, setInviteEnabled] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Queries
  const { data: clients, isLoading: clientsLoading } = useQuery<ClientAccount[]>({
    queryKey: ['/api/client-portal/admin/clients'],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/client-portal/admin/orders'],
  });

  // Data/Verification campaigns
  const { data: verificationCampaigns } = useQuery<VerificationCampaign[]>({
    queryKey: ['/api/verification-campaigns'],
  });

  // Regular campaigns (all types)
  const { data: allCampaigns } = useQuery<any[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns', {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  const { data: invoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<Invoice[]>({
    queryKey: ['/api/client-portal/admin/invoices'],
  });

  // Mutations
  const createClientMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      companyName?: string;
      contactEmail?: string;
      contactPhone?: string;
      inviteDomains?: string[];
      inviteEnabled?: boolean;
    }) => {
      return apiRequest('POST', '/api/client-portal/admin/clients', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/clients'] });
      setShowCreateClient(false);
      toast({ title: 'Client created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create client', variant: 'destructive' });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${selectedClient?.id}/users`, data);
    },
    onSuccess: () => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      setShowCreateUser(false);
      toast({ title: 'User created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create user', variant: 'destructive' });
    },
  });

  const grantAccessMutation = useMutation({
    mutationFn: async ({ campaignId, campaignType }: { campaignId: string; campaignType: 'verification' | 'regular' }) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${selectedClient?.id}/campaigns`, { campaignId, campaignType });
    },
    onSuccess: () => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      setShowGrantAccess(false);
      toast({ title: 'Campaign access granted' });
    },
    onError: () => {
      toast({ title: 'Failed to grant access', variant: 'destructive' });
    },
  });

  const updateBillingMutation = useMutation({
    mutationFn: async (data: Partial<BillingConfig>) => {
      return apiRequest('PUT', `/api/client-portal/admin/clients/${selectedClient?.id}/billing`, data);
    },
    onSuccess: () => {
      toast({ title: 'Billing configuration saved' });
      setShowBillingConfig(false);
    },
    onError: () => {
      toast({ title: 'Failed to save billing configuration', variant: 'destructive' });
    },
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: string; status: string }) => {
      return apiRequest('PATCH', `/api/client-portal/admin/invoices/${invoiceId}/status`, { status });
    },
    onSuccess: () => {
      refetchInvoices();
      toast({ title: 'Invoice status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update invoice', variant: 'destructive' });
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (data: { clientId: string; periodStart: string; periodEnd: string }) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${data.clientId}/generate-invoice`, {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      });
    },
    onSuccess: () => {
      refetchInvoices();
      setShowCreateInvoice(false);
      toast({ title: 'Invoice generated successfully' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to generate invoice', variant: 'destructive' });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => apiRequest('DELETE', `/api/client-portal/admin/clients/${clientId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/clients'] });
      setSelectedClient(null);
      setClientDetail(null);
      toast({ title: 'Client removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove client', variant: 'destructive' });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (payload: Partial<any>) => {
      if (!selectedClient) throw new Error('No client selected');
      const res = await apiRequest('PATCH', `/api/client-portal/admin/clients/${selectedClient.id}`, payload);
      return res.json();
    },
    onSuccess: (updatedClient) => {
      setSelectedClient((prev) => prev ? { ...prev, ...updatedClient } : updatedClient);
      setClientDetail((prev: any) => prev ? { ...prev, ...updatedClient } : prev);
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/clients'] });
      toast({ title: 'Client updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to update client', variant: 'destructive' });
    },
  });

  const updateInviteMutation = useMutation({
    mutationFn: async (payload: { inviteDomains: string[]; inviteEnabled: boolean }) => {
      if (!selectedClient) throw new Error('No client selected');
      return apiRequest('PATCH', `/api/client-portal/admin/clients/${selectedClient.id}`, payload);
    },
    onSuccess: () => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      setSelectedClient((prev) =>
        prev && selectedClient && prev.id === selectedClient.id
          ? { ...prev, inviteDomains: parseDomainInput(inviteDomainInput), inviteEnabled }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/clients'] });
      toast({ title: 'Invite settings updated' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to update invite settings', variant: 'destructive' });
    },
  });

  const regenerateInviteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClient) throw new Error('No client selected');
      const res = await apiRequest('POST', `/api/client-portal/admin/clients/${selectedClient.id}/invite/regenerate`);
      return res.json();
    },
    onSuccess: (data: { inviteSlug: string; joinUrl: string }) => {
      setClientDetail((prev: any) => (prev ? { ...prev, inviteSlug: data.inviteSlug } : prev));
      setSelectedClient((prev) =>
        prev && selectedClient && prev.id === selectedClient.id ? { ...prev, inviteSlug: data.inviteSlug } : prev,
      );
      setCopyState('idle');
      toast({ title: 'Invite link regenerated' });
    },
    onError: () => {
      toast({ title: 'Failed to regenerate link', variant: 'destructive' });
    },
  });

  const parseDomainInput = (value: string) =>
    Array.from(
      new Set(
        value
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter((d) => d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
      ),
    );

  const fetchClientDetail = async (clientId: string) => {
    const response = await fetch(`/api/client-portal/admin/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    const data = await response.json();
    setClientDetail(data);
    setInviteDomainInput((data?.inviteDomains || []).join(', '));
    setInviteEnabled(data?.inviteEnabled !== false);
    setCopyState('idle');
  };

  const fetchBillingConfig = async (clientId: string) => {
    const response = await fetch(`/api/client-portal/admin/clients/${clientId}/billing`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    const data = await response.json();
    setBillingConfig(data);
  };

  const handleClientClick = async (client: ClientAccount) => {
    setSelectedClient(client);
    await fetchClientDetail(client.id);
  };

  const handleOpenBillingConfig = async () => {
    if (selectedClient) {
      await fetchBillingConfig(selectedClient.id);
      setShowBillingConfig(true);
    }
  };

  const handleCreateClient = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createClientMutation.mutate({
      name: formData.get('name') as string,
      companyName: formData.get('companyName') as string,
      contactEmail: formData.get('contactEmail') as string,
      contactPhone: formData.get('contactPhone') as string,
      inviteDomains: parseDomainInput((formData.get('inviteDomains') as string) || ''),
    });
  };

  const handleCreateUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createUserMutation.mutate({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
    });
  };

  const handleSaveInviteSettings = () => {
    if (!selectedClient) return;
    updateInviteMutation.mutate({
      inviteDomains: parseDomainInput(inviteDomainInput),
      inviteEnabled,
    });
  };

  const handleDeleteClient = () => {
    if (!selectedClient) return;
    deleteClientMutation.mutate(selectedClient.id);
    setShowDeleteConfirm(false);
  };

  const joinUrl =
    selectedClient && clientDetail
      ? `${window.location.origin}/client-portal/join/${clientDetail.inviteSlug}`
      : '';

  const handleSaveBillingConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateBillingMutation.mutate({
      defaultBillingModel: formData.get('billingModel') as any,
      defaultRatePerLead: (formData.get('ratePerLead') as string) || '0',
      defaultRatePerContact: (formData.get('ratePerContact') as string) || '0',
      defaultRatePerCallMinute: (formData.get('ratePerCallMinute') as string) || '0',
      paymentTermsDays: parseInt(formData.get('paymentTerms') as string),
      billingEmail: formData.get('billingEmail') as string,
      taxExempt: formData.get('taxExempt') === 'on',
      taxRate: ((parseFloat(formData.get('taxRate') as string) || 0) / 100).toString(),
      autoInvoiceEnabled: formData.get('autoInvoice') === 'on',
      invoiceDayOfMonth: parseInt(formData.get('invoiceDayOfMonth') as string) || 1,
      paymentDueDayOfMonth: formData.get('paymentDueDayOfMonth')
        ? parseInt(formData.get('paymentDueDayOfMonth') as string)
        : null,
    });
  };

  const handleGenerateInvoice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    generateInvoiceMutation.mutate({
      clientId: formData.get('clientId') as string,
      periodStart: formData.get('periodStart') as string,
      periodEnd: formData.get('periodEnd') as string,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const totalClients = clients?.length ?? 0;
  const activeClients = clients?.filter((c) => c.isActive).length ?? 0;
  const inviteReady = clients?.filter((c: any) => !!c.inviteSlug)?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-sky-800 text-white p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-300">Outbound Admin</p>
              <h1 className="text-3xl font-semibold mt-1">Client Portal Management</h1>
              <p className="text-slate-200/80 mt-2 max-w-2xl">
                Curate access, manage billing, and ship invite links that only match verified company domains.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCreateClient(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Client
              </Button>
              {selectedClient && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-white border-white/40 hover:border-white"
                  onClick={() => setShowGrantAccess(true)}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  Grant Access
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl bg-white/10 border border-white/10 p-3">
              <p className="text-xs text-slate-200/80">Total Clients</p>
              <p className="text-2xl font-semibold">{totalClients}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 p-3">
              <p className="text-xs text-slate-200/80">Active</p>
              <p className="text-2xl font-semibold">{activeClients}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 p-3">
              <p className="text-xs text-slate-200/80">Invite-ready</p>
              <p className="text-2xl font-semibold">{inviteReady}</p>
            </div>
          </div>
        </div>
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Navigation</CardTitle>
            <CardDescription>Jump between admin surfaces</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="justify-start" onClick={() => setActiveTab('clients')}>
              <Building2 className="h-4 w-4 mr-2" />
              Clients
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setActiveTab('hierarchy')}>
              <Network className="h-4 w-4 mr-2" />
              Hierarchy
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setActiveTab('orders')}>
              <FileText className="h-4 w-4 mr-2" />
              Requests
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setActiveTab('invoices')}>
              <CreditCard className="h-4 w-4 mr-2" />
              Invoices
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setActiveTab('settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="clients">
            <Building2 className="h-4 w-4 mr-2" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="hierarchy">
            <Network className="h-4 w-4 mr-2" />
            Hierarchy
          </TabsTrigger>
          <TabsTrigger value="orders">
            <FileText className="h-4 w-4 mr-2" />
            Requests
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <CreditCard className="h-4 w-4 mr-2" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* ==================== CLIENTS TAB ==================== */}
        <TabsContent value="clients" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Client List */}
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg">Client Organizations</CardTitle>
                <Button size="sm" onClick={() => setShowCreateClient(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {clientsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : clients && clients.length > 0 ? (
                    <div className="space-y-2">
                      {clients.map((client) => (
                        <div
                          key={client.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                            selectedClient?.id === client.id ? 'border-primary bg-accent' : ''
                          }`}
                          onClick={() => handleClientClick(client)}
                        >
                          <div className="font-medium">{client.name}</div>
                          {client.companyName && (
                            <div className="text-sm text-muted-foreground">{client.companyName}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={client.isActive ? 'default' : 'secondary'}>
                              {client.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No clients yet</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Client Detail */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {selectedClient ? selectedClient.name : 'Select a Client'}
                    </CardTitle>
                    {selectedClient && (
                      <CardDescription>{selectedClient.contactEmail}</CardDescription>
                    )}
                  </div>
                  {selectedClient && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleOpenBillingConfig}>
                        <DollarSign className="h-4 w-4 mr-1" />
                        Billing
                      </Button>
                      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {selectedClient.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the client account and all linked portal users. Campaign assets and
                              orders tied to this client will cascade-delete. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteClient}
                              disabled={deleteClientMutation.isPending}
                            >
                              {deleteClientMutation.isPending ? 'Removing...' : 'Delete client'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedClient && clientDetail ? (
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6">
                      <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Overview</TabsTrigger>
                      <TabsTrigger value="profile" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Profile</TabsTrigger>
                      <TabsTrigger value="pricing" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Pricing</TabsTrigger>
                      <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Settings</TabsTrigger>
                      <TabsTrigger value="users" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Users & Access</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile">
                        <ClientProfileEditor client={clientDetail} onSave={updateClientMutation.mutate} isLoading={updateClientMutation.isPending} />
                    </TabsContent>

                    <TabsContent value="settings">
                        <ClientSettingsEditor client={clientDetail} onSave={updateClientMutation.mutate} isLoading={updateClientMutation.isPending} />
                    </TabsContent>

                    <TabsContent value="pricing">
                        <ClientCampaignPricingEditor clientId={selectedClient.id} />
                        <ClientPricingDocumentsManager clientId={selectedClient.id} />
                    </TabsContent>

                    <TabsContent value="overview">
                      <div className="space-y-6">
                        <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold flex items-center gap-2">
                              <LinkIcon className="h-4 w-4" />
                              Invite & self-serve access
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Unique URL for this client. Only company domains below can join.
                            </p>
                          </div>
                          <Badge variant={inviteEnabled ? 'default' : 'secondary'}>
                            {inviteEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <Label>Join link</Label>
                          <div className="flex gap-2">
                            <Input readOnly value={joinUrl} className="font-mono text-xs" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!joinUrl) return;
                                navigator.clipboard.writeText(joinUrl);
                                setCopyState('copied');
                                setTimeout(() => setCopyState('idle'), 1500);
                              }}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              {copyState === 'copied' ? 'Copied' : 'Copy'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(joinUrl, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch checked={inviteEnabled} onCheckedChange={setInviteEnabled} id="invite-enabled" />
                            <Label htmlFor="invite-enabled" className="text-sm text-muted-foreground">
                              Allow employees to self-enroll
                            </Label>
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-auto"
                              onClick={() => regenerateInviteMutation.mutate()}
                              disabled={regenerateInviteMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              {regenerateInviteMutation.isPending ? 'Refreshing...' : 'Regenerate'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Allowed email domains</Label>
                          <Input
                            value={inviteDomainInput}
                            onChange={(e) => setInviteDomainInput(e.target.value)}
                            placeholder="acme.com, acme.co.uk"
                          />
                          <p className="text-xs text-muted-foreground">
                            Comma separated. If blank, only manually-created users can log in.
                          </p>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => fetchClientDetail(selectedClient.id)}>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Reset
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveInviteSettings}
                            disabled={updateInviteMutation.isPending}
                          >
                            {updateInviteMutation.isPending ? 'Saving...' : 'Save access controls'}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-xl border p-4 bg-muted/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Client snapshot
                          </h3>
                          <Badge variant={selectedClient.isActive ? 'default' : 'secondary'}>
                            {selectedClient.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Company</p>
                            <p className="font-medium">{selectedClient.companyName || '—'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Primary contact</p>
                            <p className="font-medium">{selectedClient.contactEmail || '—'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Projects</p>
                            <p className="font-medium">{clientDetail.projects?.length ?? 0}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Portal users</p>
                            <p className="font-medium">{clientDetail.users?.length ?? 0}</p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Self-serve link is locked to the domains above. Use the "Grant Access" button to hand-pick
                          campaign entitlements for this client.
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="users">
                    <div className="pt-4 space-y-6">
                        {/* Users Section */}
                        <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          User Accounts
                        </h3>
                        <Button size="sm" variant="outline" onClick={() => setShowCreateUser(true)}>
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add User
                        </Button>
                      </div>
                      {clientDetail.users && clientDetail.users.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Last Login</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientDetail.users.map((user: any) => (
                              <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.email}</TableCell>
                                <TableCell>
                                  {user.firstName} {user.lastName}
                                </TableCell>
                                <TableCell>
                                  {user.lastLoginAt
                                    ? new Date(user.lastLoginAt).toLocaleDateString()
                                    : 'Never'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                                    {user.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-sm py-4 text-center border rounded-lg">
                          No users yet. Add a user to enable client portal access.
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Campaign Access Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          Campaign Access
                        </h3>
                        <Button size="sm" variant="outline" onClick={() => setShowGrantAccess(true)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Grant Access
                        </Button>
                      </div>
                      
                      {/* All Campaigns Table */}
                      {((clientDetail.campaigns && clientDetail.campaigns.length > 0) || 
                        (clientDetail.regularCampaigns && clientDetail.regularCampaigns.length > 0)) ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Campaign</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Granted</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Data/Verification Campaigns */}
                            {clientDetail.campaigns?.map((access: any) => (
                              <TableRow key={`data-${access.id}`}>
                                <TableCell className="font-medium">{access.campaign.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                    <Database className="h-3 w-3" />
                                    Data
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      access.campaign.status === 'active' ? 'default' : 'secondary'
                                    }
                                  >
                                    {access.campaign.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {new Date(access.createdAt).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Email/Phone Campaigns */}
                            {clientDetail.regularCampaigns?.map((access: any) => (
                              <TableRow key={`regular-${access.id}`}>
                                <TableCell className="font-medium">{access.campaign.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                    {access.campaign.campaignType === 'email' ? (
                                      <><Mail className="h-3 w-3" /> Email</>
                                    ) : access.campaign.campaignType === 'call' ? (
                                      <><Phone className="h-3 w-3" /> Phone</>
                                    ) : (
                                      <><Target className="h-3 w-3" /> {access.campaign.campaignType}</>
                                    )}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      access.campaign.status === 'active' ? 'default' : 'secondary'
                                    }
                                  >
                                    {access.campaign.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {new Date(access.createdAt).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-sm py-4 text-center border rounded-lg">
                          No campaigns assigned. Grant access to campaigns for this client.
                        </p>
                      )}
                    </div>
                  </div>
                  </TabsContent>
                  </Tabs>
                ) : (
                  <p className="text-muted-foreground text-center py-12">
                    Select a client to view and manage their details
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== HIERARCHY TAB ==================== */}
        <TabsContent value="hierarchy">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Client-Organization Hierarchy</CardTitle>
                  <CardDescription>
                    Manage the three-tier hierarchy: Super Organization → Campaign Organizations → Clients
                  </CardDescription>
                </div>
                <Button onClick={() => setLocation('/client-hierarchy-manager')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Full Manager
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Super Organization</CardDescription>
                    <CardTitle className="text-2xl">Pivotal B2B</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Platform owner managing all campaign organizations
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Campaign Organizations</CardDescription>
                    <CardTitle className="text-2xl">—</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Internal teams managing campaigns and projects
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Clients</CardDescription>
                    <CardTitle className="text-2xl">{clients?.length || 0}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      External entities receiving deliverables
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Quick Actions</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLocation('/client-hierarchy-manager')}>
                    <Network className="h-4 w-4 mr-2" />
                    View Full Hierarchy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLocation('/qa-review-center')}>
                    <Eye className="h-4 w-4 mr-2" />
                    QA Review Center
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ORDERS TAB ==================== */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Requests</CardTitle>
              <CardDescription>Pending and recent campaign requests from clients</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : orders && orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Requested Leads</TableHead>
                      <TableHead>CPL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((item: any) => (
                      <TableRow key={item.order.id}>
                        <TableCell className="font-mono text-sm">
                          {item.order.orderNumber}
                        </TableCell>
                        <TableCell>{item.client.name}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{item.campaign.name}</span>
                            {item.order.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {item.order.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.order.requestedQuantity || '-'}</TableCell>
                        <TableCell>
                          {item.order.ratePerLead ? `$${item.order.ratePerLead}` : <span className="text-muted-foreground">Not set</span>}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              item.order.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : item.order.status === 'active'
                                ? 'bg-blue-100 text-blue-800'
                                : item.order.status === 'approved'
                                ? 'bg-purple-100 text-purple-800'
                                : item.order.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {item.order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.order.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setLocation(`/client-portal/orders/${item.order.id}`)
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">No campaign requests yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== INVOICES TAB ==================== */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>Manage client invoices and payments</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetchInvoices()}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => setShowCreateInvoice(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Generate Invoice
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell>{invoice.clientName}</TableCell>
                        <TableCell>
                          {new Date(invoice.billingPeriodStart).toLocaleDateString()} -{' '}
                          {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(invoice.totalAmount)}
                        </TableCell>
                        <TableCell>{formatCurrency(invoice.amountPaid)}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[invoice.status]}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {invoice.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateInvoiceStatusMutation.mutate({
                                    invoiceId: invoice.id,
                                    status: 'sent',
                                  })
                                }
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {invoice.status === 'sent' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateInvoiceStatusMutation.mutate({
                                    invoiceId: invoice.id,
                                    status: 'paid',
                                  })
                                }
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {invoice.pdfUrl && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={invoice.pdfUrl} target="_blank" rel="noopener">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No invoices yet</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => setShowCreateInvoice(true)}
                  >
                    Generate First Invoice
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== SETTINGS TAB ==================== */}
        <TabsContent value="settings">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Default Pricing</CardTitle>
                <CardDescription>
                  Set default rates for new clients. These can be overridden per client.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Rate per Lead</Label>
                    <Input type="number" defaultValue="150" disabled />
                  </div>
                  <div>
                    <Label>Rate per Contact</Label>
                    <Input type="number" defaultValue="25" disabled />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure per-client rates in the client billing settings.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auto-Invoice Settings</CardTitle>
                <CardDescription>Configure automatic monthly invoice generation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Auto-Invoicing</Label>
                  <Switch defaultChecked />
                </div>
                <div>
                  <Label>Invoice Day of Month</Label>
                  <Select defaultValue="1">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 5, 10, 15, 20, 25].map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          Day {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* Create Client Dialog */}
      <Dialog open={showCreateClient} onOpenChange={setShowCreateClient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Client Organization</DialogTitle>
            <DialogDescription>Add a new client to the portal</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateClient}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Organization Name *</Label>
                <Input id="name" name="name" required placeholder="Acme Corp" />
              </div>
              <div>
                <Label htmlFor="companyName">Legal Company Name</Label>
                <Input id="companyName" name="companyName" placeholder="Acme Corporation Inc." />
              </div>
              <div>
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  placeholder="contact@acme.com"
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input id="contactPhone" name="contactPhone" placeholder="+1 555 123 4567" />
              </div>
              <div>
                <Label htmlFor="inviteDomains">Allowed email domains (comma separated)</Label>
                <Input id="inviteDomains" name="inviteDomains" placeholder="acme.com, acme.co.uk" />
                <p className="text-xs text-muted-foreground">
                  We'll lock the join link to these domains. Leave blank to auto-use the contact email domain.
                </p>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateClient(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClientMutation.isPending}>
                {createClientMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {selectedClient?.name}</DialogTitle>
            <DialogDescription>Create a login account for client portal access</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" name="email" type="email" required placeholder="user@client.com" />
              </div>
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input id="password" name="password" type="password" required minLength={8} />
                <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" placeholder="John" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" placeholder="Doe" />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Grant Campaign Access Dialog */}
      <Dialog open={showGrantAccess} onOpenChange={(open) => {
        setShowGrantAccess(open);
        if (!open) {
          setSelectedCampaignId('');
          setGrantAccessCampaignType('data');
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grant Campaign Access</DialogTitle>
            <DialogDescription>
              Select a campaign type and campaign to grant access to {selectedClient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Campaign Type Tabs */}
            <Tabs value={grantAccessCampaignType} onValueChange={(v) => {
              setGrantAccessCampaignType(v as 'data' | 'regular');
              setSelectedCampaignId('');
            }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="data" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Data Verification
                </TabsTrigger>
                <TabsTrigger value="regular" className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Standard Campaigns
                </TabsTrigger>
              </TabsList>

              {/* Data/Verification Campaigns */}
              <TabsContent value="data" className="mt-4">
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a data campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {verificationCampaigns?.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-green-600" />
                          {campaign.name}
                        </div>
                      </SelectItem>
                    ))}
                    {(!verificationCampaigns || verificationCampaigns.length === 0) && (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No data campaigns available
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Data campaigns provide access to verified contacts and enrichment data.
                </p>
              </TabsContent>

              {/* Regular Campaigns (All types) */}
              <TabsContent value="regular" className="mt-4">
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a campaign" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {/* Group campaigns by type */}
                    {allCampaigns && allCampaigns.length > 0 ? (
                      Object.entries(
                        allCampaigns.reduce<Record<string, any[]>>((acc, campaign) => {
                          const type = campaign.type || 'other';
                          if (!acc[type]) acc[type] = [];
                          acc[type].push(campaign);
                          return acc;
                        }, {})
                      ).map(([type, campaigns]: [string, any[]]) => (
                        <SelectGroup key={type}>
                          <SelectLabel className="capitalize border-b pb-1 mb-1 mt-2 text-primary/80">
                            {type.replace(/_/g, ' ')}
                          </SelectLabel>
                          {campaigns.map((campaign) => (
                            <SelectItem key={campaign.id} value={String(campaign.id)}>
                              <div className="flex items-center gap-2 ml-2">
                                {type === 'email' ? <Mail className="h-4 w-4 text-blue-600" /> :
                                 type === 'call' ? <Phone className="h-4 w-4 text-purple-600" /> :
                                 <Target className="h-4 w-4 text-slate-600" />
                                }
                                <span className="truncate max-w-[280px]">{campaign.name}</span>
                                <Badge variant="secondary" className="ml-auto text-xs py-0 h-5">
                                  {campaign.status}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No campaigns available
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Standard campaigns include Email, Call, Webinar, Events, and more.
                </p>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGrantAccess(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedCampaignId) {
                  grantAccessMutation.mutate({
                    campaignId: selectedCampaignId,
                    campaignType: grantAccessCampaignType === 'data' ? 'verification' : 'regular'
                  });
                }
              }}
              disabled={!selectedCampaignId || grantAccessMutation.isPending}
            >
              {grantAccessMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Configuration Dialog */}
      <Dialog open={showBillingConfig} onOpenChange={setShowBillingConfig}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Billing Configuration - {selectedClient?.name}</DialogTitle>
            <DialogDescription>Set pricing, payment terms, and invoicing settings</DialogDescription>
          </DialogHeader>
          {billingConfig && (
            <form onSubmit={handleSaveBillingConfig}>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Pricing</h4>
                  <div>
                    <Label htmlFor="billingModel">Billing Model</Label>
                    <Select name="billingModel" defaultValue={billingConfig.defaultBillingModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpl">Cost Per Lead (CPL)</SelectItem>
                        <SelectItem value="cpc">Cost Per Contact (CPC)</SelectItem>
                        <SelectItem value="monthly_retainer">Monthly Retainer</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ratePerLead">Rate per Lead ($)</Label>
                    <Input
                      id="ratePerLead"
                      name="ratePerLead"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(billingConfig.defaultRatePerLead)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ratePerContact">Rate per Contact ($)</Label>
                    <Input
                      id="ratePerContact"
                      name="ratePerContact"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(billingConfig.defaultRatePerContact)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ratePerCallMinute">Rate per AI Call Minute ($)</Label>
                    <Input
                      id="ratePerCallMinute"
                      name="ratePerCallMinute"
                      type="number"
                      step="0.0001"
                      defaultValue={parseFloat(billingConfig.defaultRatePerCallMinute)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Payment & Tax</h4>
                  <div>
                    <Label htmlFor="paymentTerms">Payment Terms (days)</Label>
                    <Select name="paymentTerms" defaultValue={billingConfig.paymentTermsDays.toString()}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">NET 15</SelectItem>
                        <SelectItem value="30">NET 30</SelectItem>
                        <SelectItem value="45">NET 45</SelectItem>
                        <SelectItem value="60">NET 60</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="billingEmail">Billing Email</Label>
                    <Input
                      id="billingEmail"
                      name="billingEmail"
                      type="email"
                      defaultValue={billingConfig.billingEmail || ''}
                      placeholder="billing@client.com"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="taxExempt">Tax Exempt</Label>
                    <Switch id="taxExempt" name="taxExempt" defaultChecked={billingConfig.taxExempt} />
                  </div>
                  <div>
                    <Label htmlFor="taxRate">Tax Rate (%)</Label>
                    <Input
                      id="taxRate"
                      name="taxRate"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(billingConfig.taxRate) * 100}
                      disabled={billingConfig.taxExempt}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoInvoice">Auto-Generate Invoices</Label>
                    <Switch
                      id="autoInvoice"
                      name="autoInvoice"
                      defaultChecked={billingConfig.autoInvoiceEnabled}
                    />
                  </div>
                  <div>
                    <Label htmlFor="invoiceDayOfMonth">Invoice Day of Month</Label>
                    <Select name="invoiceDayOfMonth" defaultValue={(billingConfig.invoiceDayOfMonth || 1).toString()}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="paymentDueDayOfMonth">Payment Due Day of Month</Label>
                    <Input
                      id="paymentDueDayOfMonth"
                      name="paymentDueDayOfMonth"
                      type="number"
                      min="1"
                      max="28"
                      defaultValue={billingConfig.paymentDueDayOfMonth || ''}
                      placeholder="Leave blank to use NET-X days"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Set to e.g. 10 for "due by the 10th". Leave blank to use NET-X days.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setShowBillingConfig(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBillingMutation.isPending}>
                  {updateBillingMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Configuration
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Invoice Dialog */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice from uninvoiced activity costs
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGenerateInvoice}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="clientId">Client</Label>
                <Select name="clientId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="periodStart">Period Start</Label>
                  <Input id="periodStart" name="periodStart" type="date" required />
                </div>
                <div>
                  <Label htmlFor="periodEnd">Period End</Label>
                  <Input id="periodEnd" name="periodEnd" type="date" required />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateInvoice(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={generateInvoiceMutation.isPending}>
                {generateInvoiceMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Generate Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
