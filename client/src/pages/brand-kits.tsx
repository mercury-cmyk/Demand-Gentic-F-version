/**
 * Brand Kits Management Page
 *
 * Allows users to create and manage brand kits for email templates
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Palette,
  Plus,
  Trash2,
  Edit,
  Star,
  Copy,
  Eye,
  Check,
  Loader2,
  Type,
} from 'lucide-react';

interface BrandKit {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  linkColor?: string;
  headingFont?: string;
  bodyFont?: string;
  headingFontSize?: string;
  bodyFontSize?: string;
  lineHeight?: string;
  logoImageId?: string;
  logoWidth?: number;
  logoAlignment?: 'left' | 'center' | 'right';
  companyName?: string;
  companyAddress?: string;
  socialLinks?: any;
  footerLinks?: any;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Common web-safe fonts
const FONT_OPTIONS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: '"Segoe UI", Tahoma, Geneva, sans-serif', label: 'Segoe UI' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
];

// Default brand kit values
const DEFAULT_BRAND_KIT: Partial<BrandKit> = {
  name: '',
  primaryColor: '#2563eb',
  secondaryColor: '#64748b',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  linkColor: '#2563eb',
  headingFont: 'Arial, sans-serif',
  bodyFont: 'Arial, sans-serif',
  headingFontSize: '24px',
  bodyFontSize: '16px',
  lineHeight: '1.6',
  logoAlignment: 'center',
};

export default function BrandKitsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<BrandKit | null>(null);
  const [deleteKit, setDeleteKit] = useState<BrandKit | null>(null);
  const [formData, setFormData] = useState<Partial<BrandKit>>(DEFAULT_BRAND_KIT);

  // Fetch brand kits
  const { data: brandKits = [], isLoading } = useQuery<BrandKit[]>({
    queryKey: ['brandKits'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/email-builder/brand-kits');
      return res.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<BrandKit>) => {
      const res = await apiRequest('POST', '/api/email-builder/brand-kits', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandKits'] });
      setIsCreateOpen(false);
      setFormData(DEFAULT_BRAND_KIT);
      toast({ title: 'Brand kit created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BrandKit> }) => {
      const res = await apiRequest('PUT', `/api/email-builder/brand-kits/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandKits'] });
      setEditingKit(null);
      setFormData(DEFAULT_BRAND_KIT);
      toast({ title: 'Brand kit updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/email-builder/brand-kits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandKits'] });
      setDeleteKit(null);
      toast({ title: 'Brand kit deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Handle form submission
  const handleSubmit = () => {
    if (editingKit) {
      updateMutation.mutate({ id: editingKit.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Open edit dialog
  const openEdit = (kit: BrandKit) => {
    setFormData(kit);
    setEditingKit(kit);
  };

  // Close dialog
  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingKit(null);
    setFormData(DEFAULT_BRAND_KIT);
  };

  // Update form field
  const updateField = (field: keyof BrandKit, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Render color picker with preview
  const ColorPicker = ({
    label,
    field,
    value,
  }: {
    label: string;
    field: keyof BrandKit;
    value?: string;
  }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2 mt-1">
        <div
          className="w-10 h-10 rounded border cursor-pointer"
          style={{ backgroundColor: value }}
        />
        <Input
          type="color"
          value={value || '#000000'}
          onChange={e => updateField(field, e.target.value)}
          className="w-14 h-10 p-1 cursor-pointer"
        />
        <Input
          value={value || ''}
          onChange={e => updateField(field, e.target.value)}
          placeholder="#000000"
          className="flex-1"
        />
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Palette className="w-6 h-6" />
            Brand Kits
          </h1>
          <p className="text-slate-500 mt-1">
            Manage your brand colors, fonts, and styles for email templates
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Brand Kit
        </Button>
      </div>

      {/* Brand Kits Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : brandKits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 text-center">
              No brand kits yet. Create your first one to maintain consistent email styling.
            </p>
            <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Brand Kit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brandKits.map(kit => (
            <Card key={kit.id} className="relative group">
              {kit.isDefault && (
                <Badge className="absolute top-3 right-3" variant="secondary">
                  <Star className="w-3 h-3 mr-1" />
                  Default
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{kit.name}</CardTitle>
                <CardDescription>
                  {kit.companyName || 'No company name set'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Color Swatches */}
                <div className="flex gap-2 mb-4">
                  <div
                    className="w-10 h-10 rounded-full border"
                    style={{ backgroundColor: kit.primaryColor }}
                    title="Primary"
                  />
                  <div
                    className="w-10 h-10 rounded-full border"
                    style={{ backgroundColor: kit.secondaryColor }}
                    title="Secondary"
                  />
                  <div
                    className="w-10 h-10 rounded-full border"
                    style={{ backgroundColor: kit.accentColor }}
                    title="Accent"
                  />
                  <div
                    className="w-10 h-10 rounded-full border"
                    style={{ backgroundColor: kit.backgroundColor }}
                    title="Background"
                  />
                  <div
                    className="w-10 h-10 rounded-full border"
                    style={{ backgroundColor: kit.textColor }}
                    title="Text"
                  />
                </div>

                {/* Font Preview */}
                <div className="text-sm text-slate-500 mb-4">
                  <div style={{ fontFamily: kit.headingFont }}>
                    Heading: {kit.headingFont?.split(',')[0]}
                  </div>
                  <div style={{ fontFamily: kit.bodyFont }}>
                    Body: {kit.bodyFont?.split(',')[0]}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(kit)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteKit(kit)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen || !!editingKit} onOpenChange={closeDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingKit ? 'Edit Brand Kit' : 'Create Brand Kit'}
            </DialogTitle>
            <DialogDescription>
              Define your brand colors, fonts, and company information
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 p-1">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs">Brand Kit Name *</Label>
                    <Input
                      value={formData.name || ''}
                      onChange={e => updateField('name', e.target.value)}
                      placeholder="My Brand Kit"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isDefault}
                      onCheckedChange={v => updateField('isDefault', v)}
                    />
                    <Label className="text-sm">Set as default brand kit</Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Colors */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Colors
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <ColorPicker
                    label="Primary Color"
                    field="primaryColor"
                    value={formData.primaryColor}
                  />
                  <ColorPicker
                    label="Secondary Color"
                    field="secondaryColor"
                    value={formData.secondaryColor}
                  />
                  <ColorPicker
                    label="Accent Color"
                    field="accentColor"
                    value={formData.accentColor}
                  />
                  <ColorPicker
                    label="Background Color"
                    field="backgroundColor"
                    value={formData.backgroundColor}
                  />
                  <ColorPicker
                    label="Text Color"
                    field="textColor"
                    value={formData.textColor}
                  />
                  <ColorPicker
                    label="Link Color"
                    field="linkColor"
                    value={formData.linkColor}
                  />
                </div>
              </div>

              <Separator />

              {/* Typography */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Typography
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Heading Font</Label>
                    <Select
                      value={formData.headingFont}
                      onValueChange={v => updateField('headingFont', v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map(font => (
                          <SelectItem key={font.value} value={font.value}>
                            <span style={{ fontFamily: font.value }}>{font.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Body Font</Label>
                    <Select
                      value={formData.bodyFont}
                      onValueChange={v => updateField('bodyFont', v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map(font => (
                          <SelectItem key={font.value} value={font.value}>
                            <span style={{ fontFamily: font.value }}>{font.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Heading Size</Label>
                    <Select
                      value={formData.headingFontSize}
                      onValueChange={v => updateField('headingFontSize', v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20px">20px</SelectItem>
                        <SelectItem value="24px">24px</SelectItem>
                        <SelectItem value="28px">28px</SelectItem>
                        <SelectItem value="32px">32px</SelectItem>
                        <SelectItem value="36px">36px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Body Size</Label>
                    <Select
                      value={formData.bodyFontSize}
                      onValueChange={v => updateField('bodyFontSize', v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="14px">14px</SelectItem>
                        <SelectItem value="15px">15px</SelectItem>
                        <SelectItem value="16px">16px</SelectItem>
                        <SelectItem value="17px">17px</SelectItem>
                        <SelectItem value="18px">18px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Company Info */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Company Information (for footer)</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs">Company Name</Label>
                    <Input
                      value={formData.companyName || ''}
                      onChange={e => updateField('companyName', e.target.value)}
                      placeholder="Your Company Name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Company Address</Label>
                    <Input
                      value={formData.companyAddress || ''}
                      onChange={e => updateField('companyAddress', e.target.value)}
                      placeholder="123 Business St, City, State 12345"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </h3>
                <div
                  className="rounded-lg p-6 border"
                  style={{
                    backgroundColor: formData.backgroundColor,
                    color: formData.textColor,
                    fontFamily: formData.bodyFont,
                    fontSize: formData.bodyFontSize,
                    lineHeight: formData.lineHeight,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: formData.headingFont,
                      fontSize: formData.headingFontSize,
                      marginBottom: '16px',
                    }}
                  >
                    Sample Heading
                  </h2>
                  <p style={{ marginBottom: '16px' }}>
                    This is a preview of how your brand kit will look in an email.
                    The colors and fonts you've selected are applied here.
                  </p>
                  <a href="#" style={{ color: formData.linkColor }}>
                    Sample Link
                  </a>
                  <div style={{ marginTop: '16px' }}>
                    <button
                      style={{
                        backgroundColor: formData.primaryColor,
                        color: '#ffffff',
                        padding: '10px 24px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Primary Button
                    </button>
                    <button
                      style={{
                        backgroundColor: formData.secondaryColor,
                        color: '#ffffff',
                        padding: '10px 24px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        marginLeft: '8px',
                      }}
                    >
                      Secondary Button
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.name ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingKit ? 'Save Changes' : 'Create Brand Kit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteKit} onOpenChange={() => setDeleteKit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand Kit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteKit?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKit && deleteMutation.mutate(deleteKit.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
