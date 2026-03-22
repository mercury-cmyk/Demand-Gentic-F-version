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
const DEFAULT_BRAND_KIT: Partial = {
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
  const [editingKit, setEditingKit] = useState(null);
  const [deleteKit, setDeleteKit] = useState(null);
  const [formData, setFormData] = useState>(DEFAULT_BRAND_KIT);

  // Fetch brand kits
  const { data: brandKits = [], isLoading } = useQuery({
    queryKey: ['brandKits'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/email-builder/brand-kits');
      return res.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial) => {
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
    mutationFn: async ({ id, data }: { id: string; data: Partial }) => {
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
    
      {label}
      
        
         updateField(field, e.target.value)}
          className="w-14 h-10 p-1 cursor-pointer"
        />
         updateField(field, e.target.value)}
          placeholder="#000000"
          className="flex-1"
        />
      
    
  );

  return (
    
      {/* Header */}
      
        
          
            
            Brand Kits
          
          
            Manage your brand colors, fonts, and styles for email templates
          
        
         setIsCreateOpen(true)}>
          
          New Brand Kit
        
      

      {/* Brand Kits Grid */}
      {isLoading ? (
        
          
        
      ) : brandKits.length === 0 ? (
        
          
            
            
              No brand kits yet. Create your first one to maintain consistent email styling.
            
             setIsCreateOpen(true)}>
              
              Create Brand Kit
            
          
        
      ) : (
        
          {brandKits.map(kit => (
            
              {kit.isDefault && (
                
                  
                  Default
                
              )}
              
                {kit.name}
                
                  {kit.companyName || 'No company name set'}
                
              
              
                {/* Color Swatches */}
                
                  
                  
                  
                  
                  
                

                {/* Font Preview */}
                
                  
                    Heading: {kit.headingFont?.split(',')[0]}
                  
                  
                    Body: {kit.bodyFont?.split(',')[0]}
                  
                

                {/* Actions */}
                
                   openEdit(kit)}
                  >
                    
                    Edit
                  
                   setDeleteKit(kit)}
                  >
                    
                  
                
              
            
          ))}
        
      )}

      {/* Create/Edit Dialog */}
      
        
          
            
              {editingKit ? 'Edit Brand Kit' : 'Create Brand Kit'}
            
            
              Define your brand colors, fonts, and company information
            
          

          
            
              {/* Basic Info */}
              
                Basic Information
                
                  
                    Brand Kit Name *
                     updateField('name', e.target.value)}
                      placeholder="My Brand Kit"
                      className="mt-1"
                    />
                  
                  
                     updateField('isDefault', v)}
                    />
                    Set as default brand kit
                  
                
              

              

              {/* Colors */}
              
                
                  
                  Colors
                
                
                  
                  
                  
                  
                  
                  
                
              

              

              {/* Typography */}
              
                
                  
                  Typography
                
                
                  
                    Heading Font
                     updateField('headingFont', v)}
                    >
                      
                        
                      
                      
                        {FONT_OPTIONS.map(font => (
                          
                            {font.label}
                          
                        ))}
                      
                    
                  
                  
                    Body Font
                     updateField('bodyFont', v)}
                    >
                      
                        
                      
                      
                        {FONT_OPTIONS.map(font => (
                          
                            {font.label}
                          
                        ))}
                      
                    
                  
                  
                    Heading Size
                     updateField('headingFontSize', v)}
                    >
                      
                        
                      
                      
                        20px
                        24px
                        28px
                        32px
                        36px
                      
                    
                  
                  
                    Body Size
                     updateField('bodyFontSize', v)}
                    >
                      
                        
                      
                      
                        14px
                        15px
                        16px
                        17px
                        18px
                      
                    
                  
                
              

              

              {/* Company Info */}
              
                Company Information (for footer)
                
                  
                    Company Name
                     updateField('companyName', e.target.value)}
                      placeholder="Your Company Name"
                      className="mt-1"
                    />
                  
                  
                    Company Address
                     updateField('companyAddress', e.target.value)}
                      placeholder="123 Business St, City, State 12345"
                      className="mt-1"
                    />
                  
                
              

              {/* Preview */}
              
              
                
                  
                  Preview
                
                
                  
                    Sample Heading
                  
                  
                    This is a preview of how your brand kit will look in an email.
                    The colors and fonts you've selected are applied here.
                  
                  
                    Sample Link
                  
                  
                    
                      Primary Button
                    
                    
                      Secondary Button
                    
                  
                
              
            
          

          
            
              Cancel
            
            
              {(createMutation.isPending || updateMutation.isPending) && (
                
              )}
              {editingKit ? 'Save Changes' : 'Create Brand Kit'}
            
          
        
      

      {/* Delete Confirmation */}
       setDeleteKit(null)}>
        
          
            Delete Brand Kit
            
              Are you sure you want to delete "{deleteKit?.name}"? This action cannot be undone.
            
          
          
            Cancel
             deleteKit && deleteMutation.mutate(deleteKit.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                
              ) : (
                'Delete'
              )}
            
          
        
      
    
  );
}