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
  KeyRound,
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
  LogIn,
  Play,
  Pencil,
} from 'lucide-react';
import type { ClientAccount, VerificationCampaign } from '@shared/schema';
import { InvoiceEditor } from '@/components/invoicing/InvoiceEditor';
import { InvoicePreviewDialog } from '@/components/invoicing/InvoicePreviewDialog';
import { SendInvoiceDialog } from '@/components/invoicing/SendInvoiceDialog';
import { downloadInvoicePDF } from '@/lib/invoice-pdf';
import type { InvoiceData, InvoiceLineItem } from '@/components/invoicing/InvoiceDocument';
import { ClientNotificationCenter } from '@/components/admin/client-notification-center';
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
import { setClientPortalSession } from '@/lib/client-portal-session';

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
    
      
        
          Business Summary
           handleChange('summary', e.target.value)}
            placeholder="What does the client do?" 
            rows={3}
          />
        
        
          Problem Solved
           handleChange('problemSolved', e.target.value)}
            placeholder="What core problems do they solve?" 
             rows={3}
          />
        
      
      
      
        
          Target Audience
           handleChange('targetAudience', e.target.value)}
            placeholder="Who are they selling to?" 
          />
        
        
          Engagement Model
           handleChange('engagementModel', e.target.value)}
            placeholder="How do we work with them?" 
          />
        
      

      
        
            Products (comma separated)
             handleArrayChange('products', e.target.value)}
            />
        
        
            Services (comma separated)
             handleArrayChange('services', e.target.value)}
            />
        
      

      
        
            Industries (comma separated)
             handleArrayChange('industries', e.target.value)}
            />
        
         
            Key Differentiators
             handleChange('differentiators', e.target.value)}
                placeholder="Why them?"
            />
        
      

      
        
            Priorities (comma separated)
             handleArrayChange('priorities', e.target.value)}
            />
        
        
            Constraints (comma separated)
             handleArrayChange('constraints', e.target.value)}
            />
        
      

      
         onSave({ profile: data })} disabled={isLoading}>
          {isLoading && }
          Save Profile
        
      
    
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
    
      
        Feature Visibility
        
            {['showBilling', 'showLeads', 'showRecordings', 'showProjectDetails'].map((feature) => (
                
                     handleFeatureToggle(feature, checked)}
                    />
                    {feature.replace(/([A-Z])/g, ' $1').trim()}
                
            ))}
        
      

      
        Default Campaign Types (comma separated)
         handleChange('defaultCampaignTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      

       
        Preferred Workflows (comma separated)
         handleChange('preferredWorkflows', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      

      
        Agent Defaults (JSON)
         updateNestedJson('agentDefaults', 'val', e.target.value)}
            className="font-mono text-sm"
            rows={5}
        />
      

      
         onSave({ settings: data })} disabled={isLoading}>
           {isLoading && }
           Save Settings
        
      
    
  );
};

// Campaign Pricing Editor Component
const ClientCampaignPricingEditor = ({ clientId }: { clientId: string }) => {
  const { toast } = useToast();
  const [editingType, setEditingType] = useState(null);
  const [editValues, setEditValues] = useState({ pricePerLead: '', minimumOrderSize: 100, isEnabled: true, notes: '' });

  // Fetch pricing data
  const { data: pricingData, isLoading, refetch } = useQuery({
    queryKey: ['client-campaign-pricing', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/campaign-pricing`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch pricing');
      return res.json();
    },
    enabled: !!clientId,
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async ({ campaignType, data }: { campaignType: string; data: any }) => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/campaign-pricing/${campaignType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
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
      
        
      
    );
  }

  return (
    
      
        
          
            
            Campaign Type Pricing
          
          
            Set custom pricing for each campaign type. Unconfigured types use default pricing.
          
        
        
          {pricingData?.configuredCount || 0} / {pricingData?.totalCampaignTypes || 0} configured
        
      

      
        
          
            Campaign Type
            Price/Lead
            Min Order
            Enabled
            Notes
            Actions
          
        
        
          {pricingData?.pricing?.map((item: any) => (
            
              
                
                  {item.label}
                  {item.campaignType}
                
              
              
                {editingType === item.campaignType ? (
                   setEditValues(prev => ({ ...prev, pricePerLead: e.target.value }))}
                  />
                ) : (
                  
                    ${parseFloat(item.pricePerLead).toFixed(2)}
                  
                )}
              
              
                {editingType === item.campaignType ? (
                   setEditValues(prev => ({ ...prev, minimumOrderSize: parseInt(e.target.value) || 100 }))}
                  />
                ) : (
                  {item.minimumOrderSize}
                )}
              
              
                {editingType === item.campaignType ? (
                   setEditValues(prev => ({ ...prev, isEnabled: checked }))}
                  />
                ) : (
                  item.isEnabled ? (
                    
                  ) : (
                    
                  )
                )}
              
              
                {editingType === item.campaignType ? (
                   setEditValues(prev => ({ ...prev, notes: e.target.value }))}
                  />
                ) : (
                  {item.notes || '-'}
                )}
              
              
                {editingType === item.campaignType ? (
                  
                     setEditingType(null)}>
                      Cancel
                    
                    
                      {updatePricingMutation.isPending && }
                      Save
                    
                  
                ) : (
                   handleEdit(item)}>
                    Edit
                  
                )}
              
            
          ))}
        
      

      {pricingData?.configuredCount === 0 && (
        
          No custom pricing configured. Click "Edit" to set client-specific prices.
          Current prices shown are system defaults.
        
      )}
    
  );
};

// Pricing Documents Manager Component
const ClientPricingDocumentsManager = ({ clientId }: { clientId: string }) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [docName, setDocName] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const { data: docsData, isLoading, refetch } = useQuery({
    queryKey: ['client-pricing-documents', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/pricing-documents`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch pricing documents');
      return res.json();
    },
    enabled: !!clientId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/pricing-documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
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

  const handleFileSelect = (e: React.ChangeEvent) => {
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
      const saveRes = await fetch(`/api/client-portal/admin/clients/${clientId}/pricing-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
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
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/pricing-documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
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
    if (bytes 
      
      
        
          
            
            Pricing Documents
          
          
            Upload custom pricing agreements, rate cards, or contract documents. Clients can view and download these.
          
        
        
          
           document.getElementById(`pricing-doc-upload-${clientId}`)?.click()}
          >
            
            Upload Document
          
        
      

      {isLoading ? (
        
          
        
      ) : docsData?.documents?.length > 0 ? (
        
          
            
              Document
              File
              Size
              Uploaded
              Actions
            
          
          
            {docsData.documents.map((doc: any) => (
              
                
                  
                    {doc.name}
                    {doc.description && {doc.description}}
                  
                
                
                  
                    {doc.fileName}
                  
                
                {formatFileSize(doc.fileSize)}
                
                  {new Date(doc.createdAt).toLocaleDateString()}
                  {doc.uploadedBy && by {doc.uploadedBy}}
                
                
                  
                     handleDownload(doc.id)}>
                      
                    
                     deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                    >
                      
                    
                  
                
              
            ))}
          
        
      ) : (
        
          
          No pricing documents uploaded yet.
          Upload rate cards, contracts, or pricing agreements.
        
      )}

      {/* Upload Dialog */}
      
        
          
            Upload Pricing Document
            
              Add a name and optional description for this pricing document.
            
          
          
            
              Document Name
               setDocName(e.target.value)}
                placeholder="e.g., Argyle Custom Pricing Q1 2026"
              />
            
            
              Description (Optional)
               setDocDescription(e.target.value)}
                placeholder="Brief description of the pricing agreement..."
                rows={3}
              />
            
            {pendingFile && (
              
                
                {pendingFile.name}
                ({formatFileSize(pendingFile.size)})
              
            )}
          
          
             { setShowUploadDialog(false); setPendingFile(null); }}>
              Cancel
            
            
              {isUploading && }
              {isUploading ? 'Uploading...' : 'Upload'}
            
          
        
      
    
  );
};

interface TutorialVideoItem {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  embedUrl: string;
  provider: string;
  sortOrder: number;
  isActive: boolean;
}

const ClientTutorialVideosManager = ({ clientId }: { clientId: string }) => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    url: '',
    sortOrder: 0,
    isActive: true,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['client-tutorial-videos', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/tutorial-videos`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch tutorial videos');
      return res.json();
    },
    enabled: !!clientId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/tutorial-videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create tutorial video');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Tutorial video added' });
      setIsDialogOpen(false);
      setEditingVideo(null);
      setFormData({ title: '', description: '', url: '', sortOrder: 0, isActive: true });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add video', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ videoId, payload }: { videoId: string; payload: typeof formData }) => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/tutorial-videos/${videoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update tutorial video');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Tutorial video updated' });
      setIsDialogOpen(false);
      setEditingVideo(null);
      setFormData({ title: '', description: '', url: '', sortOrder: 0, isActive: true });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update video', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (videoId: string) => {
      const res = await fetch(`/api/client-portal/admin/clients/${clientId}/tutorial-videos/${videoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!res.ok) throw new Error('Failed to delete tutorial video');
    },
    onSuccess: () => {
      toast({ title: 'Tutorial video removed' });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove video', description: error.message, variant: 'destructive' });
    },
  });

  const openCreateDialog = () => {
    setEditingVideo(null);
    setFormData({
      title: '',
      description: '',
      url: '',
      sortOrder: (data?.videos?.length || 0),
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (video: TutorialVideoItem) => {
    setEditingVideo(video);
    setFormData({
      title: video.title,
      description: video.description || '',
      url: video.url,
      sortOrder: video.sortOrder,
      isActive: video.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.title.trim() || !formData.url.trim()) {
      toast({ title: 'Title and URL are required', variant: 'destructive' });
      return;
    }

    if (editingVideo) {
      updateMutation.mutate({ videoId: editingVideo.id, payload: formData });
      return;
    }

    createMutation.mutate(formData);
  };

  return (
    
      
      
        
          
            
            Dashboard Tutorial Videos
          
          
            Assign client-specific onboarding and training videos. Google Drive links are supported.
          
        
        
          
          Add Video
        
      

      {isLoading ? (
        
          
        
      ) : data?.videos?.length ? (
        
          
            
              Title
              Provider
              Status
              Order
              Actions
            
          
          
            {data.videos.map((video) => (
              
                
                  
                    {video.title}
                    {video.url}
                  
                
                
                  {video.provider.replace('_', ' ')}
                
                
                  {video.isActive ? 'Active' : 'Hidden'}
                
                {video.sortOrder}
                
                  
                     window.open(video.url, '_blank')}>
                      
                    
                     openEditDialog(video)}>
                      
                    
                     deleteMutation.mutate(video.id)}
                      disabled={deleteMutation.isPending}
                    >
                      
                    
                  
                
              
            ))}
          
        
      ) : (
        
          
          No tutorial videos configured yet.
          Add one or more videos to power the client dashboard training section.
        
      )}

      
        
          
            {editingVideo ? 'Edit Tutorial Video' : 'Add Tutorial Video'}
            
              Paste a Google Drive or public video URL. Drive links are automatically converted for embedded playback.
            
          
          
            
              Video Title
               setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Getting Started with Your Dashboard"
              />
            
            
              Video URL
               setFormData((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://drive.google.com/file/d/..."
              />
            
            
              Description (optional)
               setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            
            
              
                Sort Order
                 setFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                />
              
              
                
                   setFormData((prev) => ({ ...prev, isActive: checked }))}
                  />
                  Visible to client
                
              
            
          
          
             setIsDialogOpen(false)}>
              Cancel
            
            
              {(createMutation.isPending || updateMutation.isPending) && (
                
              )}
              {editingVideo ? 'Save Changes' : 'Add Video'}
            
          
        
      
    
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

const statusColors: Record = {
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
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [billingConfig, setBillingConfig] = useState(null);
  const [grantAccessCampaignType, setGrantAccessCampaignType] = useState('data');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [inviteDomainInput, setInviteDomainInput] = useState('');
  const [inviteEnabled, setInviteEnabled] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState(null);
  const [newClientUserPassword, setNewClientUserPassword] = useState('');
  const [confirmClientUserPassword, setConfirmClientUserPassword] = useState('');
  const [showAssignProjectDialog, setShowAssignProjectDialog] = useState(false);
  const [showUnassignProjectDialog, setShowUnassignProjectDialog] = useState(false);
  const [projectToUnassign, setProjectToUnassign] = useState(null);
  const [selectedAssignProjectId, setSelectedAssignProjectId] = useState('');

  // Invoicing state
  const [showManualInvoice, setShowManualInvoice] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [sendInvoiceTarget, setSendInvoiceTarget] = useState(null);
  const [showSendInvoice, setShowSendInvoice] = useState(false);
  const [generateInvoiceNumber, setGenerateInvoiceNumber] = useState('');
  const [generateProjectId, setGenerateProjectId] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [editingInvoiceData, setEditingInvoiceData] = useState(null);
  const [deleteInvoiceTarget, setDeleteInvoiceTarget] = useState(null);

  // Queries
  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['/api/client-portal/admin/clients'],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/client-portal/admin/orders'],
  });

  // Data/Verification campaigns
  const { data: verificationCampaigns } = useQuery({
    queryKey: ['/api/verification-campaigns'],
  });

  // Regular campaigns (all types)
  const { data: allCampaigns } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns', {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  const { data: invoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery({
    queryKey: ['/api/client-portal/admin/invoices'],
  });

  // Client-specific invoices for the invoicing sub-tab
  const { data: clientInvoicesList, isLoading: clientInvoicesLoading, refetch: refetchClientInvoices } = useQuery({
    queryKey: ['/api/client-portal/admin/invoices', { clientId: selectedClient?.id }],
    queryFn: async () => {
      const response = await fetch(`/api/client-portal/admin/invoices?clientId=${selectedClient!.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch client invoices');
      return response.json();
    },
    enabled: !!selectedClient,
  });

  // Next invoice number suggestion
  const { data: nextInvoiceNumberData } = useQuery({
    queryKey: ['/api/client-portal/admin/next-invoice-number'],
    queryFn: async () => {
      const response = await fetch('/api/client-portal/admin/next-invoice-number', {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
  });

  // Available projects for assignment (excludes current client's projects)
  const { data: availableProjectsData } = useQuery({
    queryKey: ['/api/client-portal/admin/available-projects', selectedClient?.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/client-portal/admin/available-projects${selectedClient ? `?excludeClientId=${selectedClient.id}` : ''}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
    enabled: showAssignProjectDialog && !!selectedClient,
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
    mutationFn: async (data: Partial) => {
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
    mutationFn: async (data: { clientId: string; periodStart: string; periodEnd: string; invoiceNumber?: string; projectId?: string }) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${data.clientId}/generate-invoice`, {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        invoiceNumber: data.invoiceNumber,
        projectId: data.projectId,
      });
    },
    onSuccess: () => {
      refetchInvoices();
      refetchClientInvoices();
      setShowCreateInvoice(false);
      setGenerateInvoiceNumber('');
      setGenerateProjectId('');
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/next-invoice-number'] });
      toast({ title: 'Invoice generated successfully' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to generate invoice', variant: 'destructive' });
    },
  });

  const createManualInvoiceMutation = useMutation({
    mutationFn: async (data: {
      clientAccountId: string;
      billingPeriodStart: string;
      billingPeriodEnd: string;
      invoiceNumber?: string;
      projectId?: string;
      items: Array;
      notes?: string;
      discountAmount?: number;
    }) => {
      return apiRequest('POST', '/api/client-portal/admin/invoices', data);
    },
    onSuccess: () => {
      refetchInvoices();
      refetchClientInvoices();
      setShowManualInvoice(false);
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/next-invoice-number'] });
      toast({ title: 'Invoice created successfully' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to create invoice', variant: 'destructive' });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, recipientEmail, message }: { invoiceId: string; recipientEmail: string; message?: string }) => {
      return apiRequest('POST', `/api/client-portal/admin/invoices/${invoiceId}/send`, { recipientEmail, message });
    },
    onSuccess: () => {
      refetchInvoices();
      refetchClientInvoices();
      setShowSendInvoice(false);
      setSendInvoiceTarget(null);
      toast({ title: 'Invoice sent successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to send invoice', variant: 'destructive' });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return apiRequest('DELETE', `/api/client-portal/admin/invoices/${invoiceId}`);
    },
    onSuccess: () => {
      refetchInvoices();
      refetchClientInvoices();
      setDeleteInvoiceTarget(null);
      toast({ title: 'Invoice deleted' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to delete invoice', variant: 'destructive' });
    },
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, data }: { invoiceId: string; data: any }) => {
      return apiRequest('PATCH', `/api/client-portal/admin/invoices/${invoiceId}`, data);
    },
    onSuccess: () => {
      refetchInvoices();
      refetchClientInvoices();
      setEditingInvoiceId(null);
      setEditingInvoiceData(null);
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/next-invoice-number'] });
      toast({ title: 'Invoice updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to update invoice', variant: 'destructive' });
    },
  });

  // Helper: fetch full invoice detail for editing
  const fetchInvoiceForEdit = async (invoiceId: string) => {
    const response = await fetch(`/api/client-portal/admin/invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    if (!response.ok) throw new Error('Failed to fetch invoice');
    const data = await response.json();
    setEditingInvoiceData(data);
    setEditingInvoiceId(invoiceId);
  };

  // Helper: fetch full invoice detail for preview
  const fetchInvoiceForPreview = async (invoiceId: string) => {
    const response = await fetch(`/api/client-portal/admin/invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    if (!response.ok) throw new Error('Failed to fetch invoice');
    const data = await response.json();
    const invoiceData: InvoiceData = {
      id: data.id,
      invoiceNumber: data.invoiceNumber,
      status: data.status,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      billingPeriodStart: data.billingPeriodStart,
      billingPeriodEnd: data.billingPeriodEnd,
      clientName: data.clientName || selectedClient?.name || '',
      clientCompany: data.clientCompany || selectedClient?.companyName || '',
      clientEmail: data.clientEmail || selectedClient?.contactEmail || '',
      clientPhone: data.clientPhone || selectedClient?.contactPhone || '',
      billingAddress: data.clientAddress || '',
      items: (data.items || []).map((item: any) => ({
        id: item.id,
        description: item.description,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })),
      subtotal: data.subtotal,
      taxAmount: data.taxAmount,
      discountAmount: data.discountAmount,
      totalAmount: data.totalAmount,
      amountPaid: data.amountPaid,
      currency: data.currency || 'USD',
      notes: data.notes,
    };
    setPreviewInvoice(invoiceData);
    setShowInvoicePreview(true);
  };

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

  const loginAsClientMutation = useMutation({
    mutationFn: async ({ clientId, userId }: { clientId: string; userId?: string }) => {
      const res = await apiRequest('POST', `/api/client-portal/admin/clients/${clientId}/login-as`, userId ? { userId } : {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to login as client');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setClientPortalSession(data.token, data.user);
      toast({ title: `Signed in as ${data.user.email}`, description: `Opening ${data.user.clientAccountName} dashboard...` });
      setTimeout(() => {
        window.open('/client-portal/dashboard', '_blank');
      }, 300);
    },
    onError: (error: Error) => {
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: async ({ clientUserId, clientId }: { clientUserId: string; clientId: string }) => {
      const res = await apiRequest('POST', `/api/client-portal/admin/clients/${clientId}/users/${clientUserId}/send-password-reset`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to send reset email');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Reset email sent', description: data.message || 'The user will receive a password reset email shortly.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Send failed', description: error.message, variant: 'destructive' });
    },
  });

  const setClientUserPasswordMutation = useMutation({
    mutationFn: async ({ clientId, clientUserId, password }: { clientId: string; clientUserId: string; password: string }) => {
      const res = await apiRequest('PATCH', `/api/client-portal/admin/clients/${clientId}/users/${clientUserId}`, { password });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update password');
      }
      return res.json();
    },
    onSuccess: async () => {
      if (selectedClient) {
        await fetchClientDetail(selectedClient.id);
      }
      setShowSetPasswordDialog(false);
      setPasswordTargetUser(null);
      setNewClientUserPassword('');
      setConfirmClientUserPassword('');
      toast({ title: 'Password updated', description: 'Client user password was changed successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (payload: Partial) => {
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

  const assignProjectMutation = useMutation({
    mutationFn: async ({ clientId, projectId }: { clientId: string; projectId: string }) => {
      const res = await apiRequest('POST', `/api/client-portal/admin/clients/${clientId}/projects/${projectId}/assign`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to assign project');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/available-projects'] });
      setShowAssignProjectDialog(false);
      setSelectedAssignProjectId('');
      toast({ title: 'Project assigned', description: data.message || 'Project has been assigned to this client.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Assignment failed', description: error.message, variant: 'destructive' });
    },
  });

  const unassignProjectMutation = useMutation({
    mutationFn: async ({ clientId, projectId }: { clientId: string; projectId: string }) => {
      const res = await apiRequest('DELETE', `/api/client-portal/admin/clients/${clientId}/projects/${projectId}/unassign`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to remove project');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/available-projects'] });
      setShowUnassignProjectDialog(false);
      setProjectToUnassign(null);
      toast({ title: 'Project removed', description: data.message || 'Project has been removed from this client.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Removal failed', description: error.message, variant: 'destructive' });
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

  const handleCreateClient = (e: React.FormEvent) => {
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

  const handleCreateUser = (e: React.FormEvent) => {
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

  const handleSaveBillingConfig = (e: React.FormEvent) => {
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

  const handleGenerateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    generateInvoiceMutation.mutate({
      clientId: formData.get('clientId') as string,
      periodStart: formData.get('periodStart') as string,
      periodEnd: formData.get('periodEnd') as string,
      invoiceNumber: generateInvoiceNumber || undefined,
      projectId: generateProjectId && generateProjectId !== '__all' ? generateProjectId : undefined,
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
    
      
        
          
            
              Outbound Admin
              Client Portal Management
              
                Curate access, manage billing, and ship invite links that only match verified company domains.
              
            
            
               setShowCreateClient(true)}>
                
                New Client
              
              {selectedClient && (
                 setShowGrantAccess(true)}
                >
                  
                  Grant Access
                
              )}
            
          
          
            
              Total Clients
              {totalClients}
            
            
              Active
              {activeClients}
            
            
              Invite-ready
              {inviteReady}
            
          
        
        
          
            Navigation
            Jump between admin surfaces
          
          
             setActiveTab('clients')}>
              
              Clients
            
             setActiveTab('hierarchy')}>
              
              Hierarchy
            
             setActiveTab('orders')}>
              
              Requests
            
             setActiveTab('invoices')}>
              
              Invoices
            
             setActiveTab('settings')}>
              
              Settings
            
          
        
      

      
        
          
            
            Clients
          
          
            
            Hierarchy
          
          
            
            Requests
          
          
            
            Invoices
          
          
            
            Settings
          
        

        {/* ==================== CLIENTS TAB ==================== */}
        
          
            {/* Client List */}
            
              
                Client Organizations
                 setShowCreateClient(true)}>
                  
                  Add
                
              
              
                
                  {clientsLoading ? (
                    
                      
                    
                  ) : clients && clients.length > 0 ? (
                    
                      {clients.map((client) => (
                         handleClientClick(client)}
                        >
                          {client.name}
                          {client.companyName && (
                            {client.companyName}
                          )}
                          
                            
                              {client.isActive ? 'Active' : 'Inactive'}
                            
                          
                        
                      ))}
                    
                  ) : (
                    No clients yet
                  )}
                
              
            

            {/* Client Detail */}
            
              
                
                  
                    
                      {selectedClient ? selectedClient.name : 'Select a Client'}
                    
                    {selectedClient && (
                      {selectedClient.contactEmail}
                    )}
                  
                  {selectedClient && (
                    
                       loginAsClientMutation.mutate({ clientId: selectedClient.id })}
                      >
                        
                        {loginAsClientMutation.isPending ? 'Signing in...' : 'Login as Client'}
                      
                      
                        
                        Billing
                      
                      
                        
                          
                            
                            Remove
                          
                        
                        
                          
                            Delete {selectedClient.name}?
                            
                              This removes the client account and all linked portal users. Campaign assets and
                              orders tied to this client will cascade-delete. This action cannot be undone.
                            
                          
                          
                            Cancel
                            
                              {deleteClientMutation.isPending ? 'Removing...' : 'Delete client'}
                            
                          
                        
                      
                    
                  )}
                
              
              
                {selectedClient && clientDetail ? (
                  
                    
                      Overview
                      Profile
                      Training
                      Pricing
                      Settings
                      Users & Access
                      Projects
                      Invoicing
                      Notifications
                    

                    
                        
                    

                    
                        
                    

                    
                        
                        
                    

                    
                      
                    

                    
                      
                        
                      
                        
                          
                            
                              
                              Invite & self-serve access
                            
                            
                              Unique URL for this client. Only company domains below can join.
                            
                          
                          
                            {inviteEnabled ? 'Enabled' : 'Disabled'}
                          
                        

                        
                          Join link
                          
                            
                             {
                                if (!joinUrl) return;
                                navigator.clipboard.writeText(joinUrl);
                                setCopyState('copied');
                                setTimeout(() => setCopyState('idle'), 1500);
                              }}
                            >
                              
                              {copyState === 'copied' ? 'Copied' : 'Copy'}
                            
                             window.open(joinUrl, '_blank')}
                            >
                              
                            
                          
                          
                            
                            
                              Allow employees to self-enroll
                            
                             regenerateInviteMutation.mutate()}
                              disabled={regenerateInviteMutation.isPending}
                            >
                              
                              {regenerateInviteMutation.isPending ? 'Refreshing...' : 'Regenerate'}
                            
                          
                        

                        
                          Allowed email domains
                           setInviteDomainInput(e.target.value)}
                            placeholder="acme.com, acme.co.uk"
                          />
                          
                            Comma separated. If blank, only manually-created users can log in.
                          
                        

                        
                           fetchClientDetail(selectedClient.id)}>
                            
                            Reset
                          
                          
                            {updateInviteMutation.isPending ? 'Saving...' : 'Save access controls'}
                          
                        
                      

                      
                        
                          
                            
                            Client snapshot
                          
                          
                            {selectedClient.isActive ? 'Active' : 'Inactive'}
                          
                        
                        
                          
                            Company
                            {selectedClient.companyName || '—'}
                          
                          
                            Primary contact
                            {selectedClient.contactEmail || '—'}
                          
                          
                            Projects
                            {clientDetail.projects?.length ?? 0}
                          
                          
                            Portal users
                            {clientDetail.users?.length ?? 0}
                          
                        
                        
                          Self-serve link is locked to the domains above. Use the "Grant Access" button to hand-pick
                          campaign entitlements for this client.
                        
                      
                    
                  
                

                
                    
                        {/* Users Section */}
                        
                      
                        
                          
                          User Accounts
                        
                         setShowCreateUser(true)}>
                          
                          Add User
                        
                      
                      {clientDetail.users && clientDetail.users.length > 0 ? (
                        
                          
                            
                              Email
                              Name
                              Last Login
                              Status
                              Actions
                            
                          
                          
                            {clientDetail.users.map((user: any) => (
                              
                                {user.email}
                                
                                  {user.firstName} {user.lastName}
                                
                                
                                  {user.lastLoginAt
                                    ? new Date(user.lastLoginAt).toLocaleDateString()
                                    : 'Never'}
                                
                                
                                  
                                    {user.isActive ? 'Active' : 'Inactive'}
                                  
                                
                                
                                   sendInviteMutation.mutate({ clientUserId: user.id, clientId: selectedClient!.id })}
                                    title="Send password reset email"
                                  >
                                    {sendInviteMutation.isPending && sendInviteMutation.variables?.clientUserId === user.id ? (
                                      
                                    ) : (
                                      
                                    )}
                                    Send Reset
                                  
                                   {
                                      setPasswordTargetUser(user);
                                      setNewClientUserPassword('');
                                      setConfirmClientUserPassword('');
                                      setShowSetPasswordDialog(true);
                                    }}
                                  >
                                    
                                    Set Password
                                  
                                   loginAsClientMutation.mutate({ clientId: selectedClient!.id, userId: user.id })}
                                  >
                                    
                                    Sign In
                                  
                                
                              
                            ))}
                          
                        
                      ) : (
                        
                          No users yet. Add a user to enable client portal access.
                        
                      )}
                    

                    

                    {/* Campaign Access Section */}
                    
                      
                        
                          
                          Campaign Access
                        
                         setShowGrantAccess(true)}>
                          
                          Grant Access
                        
                      
                      
                      {/* All Campaigns Table */}
                      {((clientDetail.campaigns && clientDetail.campaigns.length > 0) || 
                        (clientDetail.regularCampaigns && clientDetail.regularCampaigns.length > 0)) ? (
                        
                          
                            
                              Campaign
                              Type
                              Status
                              Granted
                            
                          
                          
                            {/* Data/Verification Campaigns */}
                            {clientDetail.campaigns?.map((access: any) => (
                              
                                {access.campaign.name}
                                
                                  
                                    
                                    Data
                                  
                                
                                
                                  
                                    {access.campaign.status}
                                  
                                
                                
                                  {new Date(access.createdAt).toLocaleDateString()}
                                
                              
                            ))}
                            {/* Email/Phone Campaigns */}
                            {clientDetail.regularCampaigns?.map((access: any) => (
                              
                                {access.campaign.name}
                                
                                  
                                    {access.campaign.campaignType === 'email' ? (
                                      <> Email
                                    ) : access.campaign.campaignType === 'call' ? (
                                      <> Phone
                                    ) : (
                                      <> {access.campaign.campaignType}
                                    )}
                                  
                                
                                
                                  
                                    {access.campaign.status}
                                  
                                
                                
                                  {new Date(access.createdAt).toLocaleDateString()}
                                
                              
                            ))}
                          
                        
                      ) : (
                        
                          No campaigns assigned. Grant access to campaigns for this client.
                        
                      )}
                    
                  
                  

                  {/* ==================== PROJECTS TAB ==================== */}
                  
                    
                      
                        
                          
                            
                            Assigned Projects
                          
                           {
                            setSelectedAssignProjectId('');
                            setShowAssignProjectDialog(true);
                          }}>
                            
                            Assign Project
                          
                        

                        {clientDetail.projects && clientDetail.projects.length > 0 ? (
                          
                            
                              
                                Project Name
                                Status
                                Created
                                Actions
                              
                            
                            
                              {clientDetail.projects.map((project: any) => (
                                
                                  {project.name}
                                  
                                    
                                      {project.status}
                                    
                                  
                                  
                                    {new Date(project.createdAt).toLocaleDateString()}
                                  
                                  
                                     {
                                        setProjectToUnassign(project);
                                        setShowUnassignProjectDialog(true);
                                      }}
                                    >
                                      
                                      Remove
                                    
                                  
                                
                              ))}
                            
                          
                        ) : (
                          
                            No projects assigned to this client. Use "Assign Project" to connect a project.
                          
                        )}
                      
                    
                  

                  {/* ===== INVOICING SUB-TAB ===== */}
                  
                    
                      {/* Section 1: Project Invoices (Auto-Generated) */}
                      
                        
                          
                            
                            Project Invoices
                          
                          
                             refetchClientInvoices()}>
                               Refresh
                            
                             {
                              setShowCreateInvoice(true);
                            }}>
                               Generate from Costs
                            
                          
                        

                        {clientInvoicesLoading ? (
                          
                            
                          
                        ) : clientInvoicesList && clientInvoicesList.length > 0 ? (
                          
                            
                              
                                Invoice #
                                Period
                                Amount
                                Paid
                                Status
                                Due Date
                                Actions
                              
                            
                            
                              {clientInvoicesList.map((invoice) => (
                                
                                  {invoice.invoiceNumber}
                                  
                                    {new Date(invoice.billingPeriodStart).toLocaleDateString()} –{' '}
                                    {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                                  
                                  
                                    {formatCurrency(invoice.totalAmount)}
                                  
                                  
                                    {formatCurrency(invoice.amountPaid)}
                                  
                                  
                                    {invoice.status}
                                  
                                  
                                    {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                                  
                                  
                                    
                                       fetchInvoiceForPreview(invoice.id)} title="Preview">
                                        
                                      
                                       {
                                        fetchInvoiceForPreview(invoice.id).then(async () => {
                                          if (previewInvoice) await downloadInvoicePDF(previewInvoice);
                                        });
                                      }} title="Download PDF">
                                        
                                      
                                      {(invoice.status === 'draft' || invoice.status === 'pending') && (
                                         {
                                          setSendInvoiceTarget({
                                            invoiceId: invoice.id,
                                            invoiceNumber: invoice.invoiceNumber,
                                            clientEmail: selectedClient?.contactEmail || '',
                                            clientName: selectedClient?.name || '',
                                          });
                                          setShowSendInvoice(true);
                                        }} title="Send to Client">
                                          
                                        
                                      )}
                                      {(invoice.status === 'draft' || invoice.status === 'pending') && (
                                         fetchInvoiceForEdit(invoice.id)} title="Edit Invoice">
                                          
                                        
                                      )}
                                      {(invoice.status === 'draft' || invoice.status === 'pending') && (
                                        
                                          setDeleteInvoiceTarget({ id: invoice.id, invoiceNumber: invoice.invoiceNumber })
                                        } title="Delete Invoice">
                                          
                                        
                                      )}
                                      {invoice.status === 'sent' && (
                                        
                                          updateInvoiceStatusMutation.mutate({ invoiceId: invoice.id, status: 'paid' })
                                        } title="Mark Paid">
                                          
                                        
                                      )}
                                    
                                  
                                
                              ))}
                            
                          
                        ) : (
                          
                            
                            No invoices for this client yet
                             setShowCreateInvoice(true)}>
                              Generate First Invoice
                            
                          
                        )}
                      

                      {/* Section 2: Manual Invoice Creation */}
                      
                        
                          
                            
                            Manual Invoice
                          
                          {!showManualInvoice && (
                             setShowManualInvoice(true)}>
                               Create Manual Invoice
                            
                          )}
                        

                        {showManualInvoice && selectedClient && (
                           createManualInvoiceMutation.mutate(data)}
                            onCancel={() => setShowManualInvoice(false)}
                          />
                        )}
                      

                      {/* Section 3: Edit Invoice */}
                      {editingInvoiceId && editingInvoiceData && selectedClient && (
                        
                          
                            
                              
                              Edit Invoice {editingInvoiceData.invoiceNumber}
                            
                          
                           ({
                              description: item.description,
                              itemType: item.itemType,
                              quantity: parseFloat(item.quantity),
                              unitPrice: parseFloat(item.unitPrice),
                              amount: parseFloat(item.amount),
                              projectId: item.projectId,
                              campaignId: item.campaignId,
                            })) || []}
                            initialPeriodStart={editingInvoiceData.billingPeriodStart || ''}
                            initialPeriodEnd={editingInvoiceData.billingPeriodEnd || ''}
                            initialDueDate={editingInvoiceData.dueDate || ''}
                            initialNotes={editingInvoiceData.notes || ''}
                            initialDiscount={parseFloat(editingInvoiceData.discountAmount || '0')}
                            initialProjectId={editingInvoiceData.items?.[0]?.projectId || ''}
                            isLoading={updateInvoiceMutation.isPending}
                            onSave={(data) => {
                              updateInvoiceMutation.mutate({
                                invoiceId: editingInvoiceId,
                                data: {
                                  billingPeriodStart: data.billingPeriodStart,
                                  billingPeriodEnd: data.billingPeriodEnd,
                                  dueDate: data.dueDate,
                                  invoiceNumber: data.invoiceNumber,
                                  items: data.items,
                                  notes: data.notes,
                                  discountAmount: data.discountAmount,
                                },
                              });
                            }}
                            onCancel={() => { setEditingInvoiceId(null); setEditingInvoiceData(null); }}
                          />
                        
                      )}

                      {/* Delete Invoice Confirmation */}
                       { if (!open) setDeleteInvoiceTarget(null); }}>
                        
                          
                            Delete Invoice
                            
                              Are you sure you want to delete invoice {deleteInvoiceTarget?.invoiceNumber}? This action cannot be undone.
                            
                          
                          
                            Cancel
                             {
                                if (deleteInvoiceTarget) {
                                  deleteInvoiceMutation.mutate(deleteInvoiceTarget.id);
                                }
                              }}
                            >
                              {deleteInvoiceMutation.isPending ?  : null}
                              Delete
                            
                          
                        
                      
                    
                  

                  
                     ({
                          id: a.campaign?.id,
                          name: a.campaign?.name,
                          status: a.campaign?.status,
                          type: a.campaign?.type || 'regular',
                        })),
                        ...(clientDetail.campaigns || []).map((a: any) => ({
                          id: a.campaign?.id,
                          name: a.campaign?.name || a.campaign?.campaignName,
                          status: a.campaign?.status,
                          type: a.type || 'verification',
                        })),
                      ].filter((c: any) => c.id)}
                    />
                  
                  
                ) : (
                  
                    Select a client to view and manage their details
                  
                )}
              
            
          
        

        {/* ==================== HIERARCHY TAB ==================== */}
        
          
            
              
                
                  Client-Organization Hierarchy
                  
                    Manage the three-tier hierarchy: Super Organization → Campaign Organizations → Clients
                  
                
                 setLocation('/client-hierarchy-manager')}>
                  
                  Open Full Manager
                
              
            
            
              
                
                  
                    Super Organization
                    Pivotal B2B
                  
                  
                    
                      Platform owner managing all campaign organizations
                    
                  
                

                
                  
                    Campaign Organizations
                    —
                  
                  
                    
                      Internal teams managing campaigns and projects
                    
                  
                

                
                  
                    Clients
                    {clients?.length || 0}
                  
                  
                    
                      External entities receiving deliverables
                    
                  
                
              

              
                Quick Actions
                
                   setLocation('/client-hierarchy-manager')}>
                    
                    View Full Hierarchy
                  
                
              
            
          
        

        {/* ==================== ORDERS TAB ==================== */}
        
          
            
              Campaign Requests
              Pending and recent campaign requests from clients
            
            
              {ordersLoading ? (
                
                  
                
              ) : orders && orders.length > 0 ? (
                
                  
                    
                      Request #
                      Client
                      Campaign Name
                      Requested Leads
                      CPL
                      Status
                      Created
                      Actions
                    
                  
                  
                    {orders.map((item: any) => (
                      
                        
                          {item.order.orderNumber}
                        
                        {item.client.name}
                        
                          
                            {item.campaign.name}
                            {item.order.description && (
                              
                                {item.order.description}
                              
                            )}
                          
                        
                        {item.order.requestedQuantity || '-'}
                        
                          {item.order.ratePerLead ? `$${item.order.ratePerLead}` : Not set}
                        
                        
                          
                            {item.order.status}
                          
                        
                        
                          {new Date(item.order.createdAt).toLocaleDateString()}
                        
                        
                          
                              setLocation(`/client-portal/orders/${item.order.id}`)
                            }
                          >
                            
                            View
                          
                        
                      
                    ))}
                  
                
              ) : (
                No campaign requests yet
              )}
            
          
        

        {/* ==================== INVOICES TAB ==================== */}
        
          
            
              
                
                  Invoices
                  Manage client invoices and payments
                
                
                   refetchInvoices()}>
                    
                    Refresh
                  
                   setShowCreateInvoice(true)}>
                    
                    Generate Invoice
                  
                
              
            
            
              {invoicesLoading ? (
                
                  
                
              ) : invoices && invoices.length > 0 ? (
                
                  
                    
                      Invoice #
                      Client
                      Period
                      Amount
                      Paid
                      Status
                      Due Date
                      Actions
                    
                  
                  
                    {invoices.map((invoice) => (
                      
                        
                          {invoice.invoiceNumber}
                        
                        {invoice.clientName}
                        
                          {new Date(invoice.billingPeriodStart).toLocaleDateString()} -{' '}
                          {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                        
                        
                          {formatCurrency(invoice.totalAmount)}
                        
                        {formatCurrency(invoice.amountPaid)}
                        
                          
                            {invoice.status}
                          
                        
                        
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString()
                            : '-'}
                        
                        
                          
                            {invoice.status === 'draft' && (
                              
                                  updateInvoiceStatusMutation.mutate({
                                    invoiceId: invoice.id,
                                    status: 'sent',
                                  })
                                }
                              >
                                
                              
                            )}
                            {invoice.status === 'sent' && (
                              
                                  updateInvoiceStatusMutation.mutate({
                                    invoiceId: invoice.id,
                                    status: 'paid',
                                  })
                                }
                              >
                                
                              
                            )}
                            {invoice.pdfUrl && (
                              
                                
                                  
                                
                              
                            )}
                          
                        
                      
                    ))}
                  
                
              ) : (
                
                  
                  No invoices yet
                   setShowCreateInvoice(true)}
                  >
                    Generate First Invoice
                  
                
              )}
            
          
        

        {/* ==================== SETTINGS TAB ==================== */}
        
          
            
              
                Default Pricing
                
                  Set default rates for new clients. These can be overridden per client.
                
              
              
                
                  
                    Rate per Lead
                    
                  
                  
                    Rate per Contact
                    
                  
                
                
                  Configure per-client rates in the client billing settings.
                
              
            

            
              
                Auto-Invoice Settings
                Configure automatic monthly invoice generation.
              
              
                
                  Enable Auto-Invoicing
                  
                
                
                  Invoice Day of Month
                  
                    
                      
                    
                    
                      {[1, 5, 10, 15, 20, 25].map((day) => (
                        
                          Day {day}
                        
                      ))}
                    
                  
                
              
            
          
        
      

      {/* ==================== DIALOGS ==================== */}

      {/* Create Client Dialog */}
      
        
          
            Create Client Organization
            Add a new client to the portal
          
          
            
              
                Organization Name *
                
              
              
                Legal Company Name
                
              
              
                Contact Email
                
              
              
                Contact Phone
                
              
              
                Allowed email domains (comma separated)
                
                
                  We'll lock the join link to these domains. Leave blank to auto-use the contact email domain.
                
              
            
            
               setShowCreateClient(false)}>
                Cancel
              
              
                {createClientMutation.isPending && (
                  
                )}
                Create Client
              
            
          
        
      

      {/* Set Client User Password Dialog */}
       {
          setShowSetPasswordDialog(open);
          if (!open) {
            setPasswordTargetUser(null);
            setNewClientUserPassword('');
            setConfirmClientUserPassword('');
          }
        }}
      >
        
          
            Set Client User Password
            
              {passwordTargetUser
                ? `Set a new password for ${passwordTargetUser.email}`
                : 'Set a new password for this client user'}
            
          
          
            
              New Password *
               setNewClientUserPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            
            
              Confirm Password *
               setConfirmClientUserPassword(e.target.value)}
                placeholder="Re-enter password"
              />
            
            {confirmClientUserPassword.length > 0 && newClientUserPassword !== confirmClientUserPassword && (
              Passwords do not match.
            )}
          
          
             setShowSetPasswordDialog(false)}>
              Cancel
            
             {
                if (!selectedClient || !passwordTargetUser) return;
                setClientUserPasswordMutation.mutate({
                  clientId: selectedClient.id,
                  clientUserId: passwordTargetUser.id,
                  password: newClientUserPassword,
                });
              }}
            >
              {setClientUserPasswordMutation.isPending && }
              Update Password
            
          
        
      

      {/* Create User Dialog */}
      
        
          
            Add User to {selectedClient?.name}
            Create a login account for client portal access
          
          
            
              
                Email *
                
              
              
                Password *
                
                Minimum 8 characters
              
              
                
                  First Name
                  
                
                
                  Last Name
                  
                
              
            
            
               setShowCreateUser(false)}>
                Cancel
              
              
                {createUserMutation.isPending && (
                  
                )}
                Create User
              
            
          
        
      

      {/* Grant Campaign Access Dialog */}
       {
        setShowGrantAccess(open);
        if (!open) {
          setSelectedCampaignId('');
          setGrantAccessCampaignType('data');
        }
      }}>
        
          
            Grant Campaign Access
            
              Select a campaign type and campaign to grant access to {selectedClient?.name}
            
          
          
            {/* Campaign Type Tabs */}
             {
              setGrantAccessCampaignType(v as 'data' | 'regular');
              setSelectedCampaignId('');
            }}>
              
                
                  
                  Data Verification
                
                
                  
                  Standard Campaigns
                
              

              {/* Data/Verification Campaigns */}
              
                
                  
                    
                  
                  
                    {verificationCampaigns?.map((campaign) => (
                      
                        
                          
                          {campaign.name}
                        
                      
                    ))}
                    {(!verificationCampaigns || verificationCampaigns.length === 0) && (
                      
                        No data campaigns available
                      
                    )}
                  
                
                
                  Data campaigns provide access to verified contacts and enrichment data.
                
              

              {/* Regular Campaigns (All types) */}
              
                
                  
                    
                  
                  
                    {/* Group campaigns by type */}
                    {allCampaigns && allCampaigns.length > 0 ? (
                      Object.entries(
                        allCampaigns.reduce>((acc, campaign) => {
                          const type = campaign.type || 'other';
                          if (!acc[type]) acc[type] = [];
                          acc[type].push(campaign);
                          return acc;
                        }, {})
                      ).map(([type, campaigns]: [string, any[]]) => (
                        
                          
                            {type.replace(/_/g, ' ')}
                          
                          {campaigns.map((campaign) => (
                            
                              
                                {type === 'email' ?  :
                                 type === 'call' ?  :
                                 
                                }
                                {campaign.name}
                                
                                  {campaign.status}
                                
                              
                            
                          ))}
                        
                      ))
                    ) : (
                      
                        No campaigns available
                      
                    )}
                  
                
                
                  Standard campaigns include Email, Call, Webinar, Events, and more.
                
              
            
          
          
             setShowGrantAccess(false)}>
              Cancel
            
             {
                if (selectedCampaignId) {
                  grantAccessMutation.mutate({
                    campaignId: selectedCampaignId,
                    campaignType: grantAccessCampaignType === 'data' ? 'verification' : 'regular'
                  });
                }
              }}
              disabled={!selectedCampaignId || grantAccessMutation.isPending}
            >
              {grantAccessMutation.isPending && }
              Grant Access
            
          
        
      

      {/* Billing Configuration Dialog */}
      
        
          
            Billing Configuration - {selectedClient?.name}
            Set pricing, payment terms, and invoicing settings
          
          {billingConfig && (
            
              
                
                  Pricing
                  
                    Billing Model
                    
                      
                        
                      
                      
                        Cost Per Lead (CPL)
                        Cost Per Contact (CPC)
                        Monthly Retainer
                        Hybrid
                      
                    
                  
                  
                    Rate per Lead ($)
                    
                  
                  
                    Rate per Contact ($)
                    
                  
                  
                    Rate per AI Call Minute ($)
                    
                  
                

                
                  Payment & Tax
                  
                    Payment Terms (days)
                    
                      
                        
                      
                      
                        NET 15
                        NET 30
                        NET 45
                        NET 60
                      
                    
                  
                  
                    Billing Email
                    
                  
                  
                    Tax Exempt
                    
                  
                  
                    Tax Rate (%)
                    
                  
                  
                    Auto-Generate Invoices
                    
                  
                  
                    Invoice Day of Month
                    
                      
                        
                      
                      
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          
                            {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                          
                        ))}
                      
                    
                  
                  
                    Payment Due Day of Month
                    
                    
                      Set to e.g. 10 for "due by the 10th". Leave blank to use NET-X days.
                    
                  
                
              
              
                 setShowBillingConfig(false)}>
                  Cancel
                
                
                  {updateBillingMutation.isPending && (
                    
                  )}
                  Save Configuration
                
              
            
          )}
        
      

      {/* Generate Invoice Dialog */}
       {
        setShowCreateInvoice(open);
        if (!open) {
          setGenerateInvoiceNumber('');
          setGenerateProjectId('');
        }
      }}>
        
          
            Generate Invoice
            
              Create an invoice from uninvoiced activity costs
            
          
          
            
              
                Client
                
                  
                    
                  
                  
                    {clients?.map((client) => (
                      
                        {client.name}
                      
                    ))}
                  
                
              
              
                Project (optional)
                
                  
                    
                  
                  
                    All projects
                    {clientDetail?.projects?.map((project: any) => (
                      
                        {project.name}
                      
                    ))}
                  
                
              
              
                Invoice Number
                 setGenerateInvoiceNumber(e.target.value)}
                  placeholder={nextInvoiceNumberData?.nextNumber || 'Auto-generated'}
                />
                
                  Leave empty to auto-generate. Enter 0 to hide number on invoice.
                  {nextInvoiceNumberData?.lastNumber && (
                    <> Last: {nextInvoiceNumberData.lastNumber}
                  )}
                
              
              
                
                  Period Start
                  
                
                
                  Period End
                  
                
              
            
            
               setShowCreateInvoice(false)}>
                Cancel
              
              
                {generateInvoiceMutation.isPending && (
                  
                )}
                Generate Invoice
              
            
          
        
      

      {/* Assign Project Dialog */}
       {
        setShowAssignProjectDialog(open);
        if (!open) setSelectedAssignProjectId('');
      }}>
        
          
            Assign Project to {selectedClient?.name}
            
              Select an existing project to reassign to this client. The project will be moved from its current client.
            
          
          
            
              Select Project
              
                
                  
                
                
                  {availableProjectsData?.projects && availableProjectsData.projects.length > 0 ? (
                    availableProjectsData.projects.map((project: any) => (
                      
                        
                          
                          {project.name}
                          
                            {project.status}
                          
                          {project.clientName && (
                            
                              ({project.clientName})
                            
                          )}
                        
                      
                    ))
                  ) : (
                    
                      No projects available for assignment
                    
                  )}
                
              
              {selectedAssignProjectId && availableProjectsData?.projects && (
                
                  This will reassign the project from its current client to {selectedClient?.name}.
                
              )}
            
          
          
             setShowAssignProjectDialog(false)}>
              Cancel
            
             {
                if (selectedClient && selectedAssignProjectId) {
                  assignProjectMutation.mutate({
                    clientId: selectedClient.id,
                    projectId: selectedAssignProjectId,
                  });
                }
              }}
              disabled={!selectedAssignProjectId || assignProjectMutation.isPending}
            >
              {assignProjectMutation.isPending && }
              Assign Project
            
          
        
      

      {/* Unassign/Remove Project Confirmation Dialog */}
       {
        setShowUnassignProjectDialog(open);
        if (!open) setProjectToUnassign(null);
      }}>
        
          
            Remove Project from Client
            
              Are you sure you want to remove the project "{projectToUnassign?.name}" from {selectedClient?.name}?
              This will permanently delete the project and disconnect all linked campaigns. This action cannot be undone.
            
          
          
             {
              setShowUnassignProjectDialog(false);
              setProjectToUnassign(null);
            }}>
              Cancel
            
             {
                if (selectedClient && projectToUnassign) {
                  unassignProjectMutation.mutate({
                    clientId: selectedClient.id,
                    projectId: projectToUnassign.id,
                  });
                }
              }}
            >
              {unassignProjectMutation.isPending && }
              Remove Project
            
          
        
      

      {/* Invoice Preview Dialog */}
       {
          setShowInvoicePreview(false);
          setSendInvoiceTarget({
            invoiceId: inv.id || '',
            invoiceNumber: inv.invoiceNumber,
            clientEmail: inv.clientEmail || selectedClient?.contactEmail || '',
            clientName: inv.clientName || selectedClient?.name || '',
          });
          setShowSendInvoice(true);
        }}
      />

      {/* Send Invoice Dialog */}
      {sendInvoiceTarget && (
         {
            setShowSendInvoice(open);
            if (!open) setSendInvoiceTarget(null);
          }}
          invoiceNumber={sendInvoiceTarget.invoiceNumber}
          clientEmail={sendInvoiceTarget.clientEmail}
          clientName={sendInvoiceTarget.clientName}
          isLoading={sendInvoiceMutation.isPending}
          onSend={(data) =>
            sendInvoiceMutation.mutate({
              invoiceId: sendInvoiceTarget.invoiceId,
              recipientEmail: data.recipientEmail,
              message: data.message,
            })
          }
        />
      )}
    
  );
}