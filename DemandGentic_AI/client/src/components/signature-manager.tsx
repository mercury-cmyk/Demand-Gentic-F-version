import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RichTextEditor } from './rich-text-editor';
import { Settings, Plus, Trash2, Star, StarOff, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailSignature {
  id: string;
  userId: string;
  name: string;
  signatureHtml: string;
  signaturePlain?: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SignatureManagerProps {
  embedded?: boolean;
}

export function SignatureManager({ embedded = false }: SignatureManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const { toast } = useToast();

  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ['/api/signatures'],
    enabled: embedded || isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; signatureHtml: string; isDefault?: boolean }) =>
      apiRequest('POST', '/api/signatures', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signatures'] });
      setName('');
      setContent('');
      setEditingSignature(null);
      toast({
        title: 'Success',
        description: 'Signature created successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create signature',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial }) =>
      apiRequest('PATCH', `/api/signatures/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signatures'] });
      setName('');
      setContent('');
      setEditingSignature(null);
      toast({
        title: 'Success',
        description: 'Signature updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update signature',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest('DELETE', `/api/signatures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signatures'] });
      toast({
        title: 'Success',
        description: 'Signature deleted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete signature',
        variant: 'destructive',
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest('POST', `/api/signatures/${id}/set-default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signatures'] });
      toast({
        title: 'Success',
        description: 'Default signature updated',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to set default signature',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!name.trim() || !content.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and content are required',
        variant: 'destructive',
      });
      return;
    }

    if (editingSignature) {
      updateMutation.mutate({
        id: editingSignature.id,
        data: {
          name,
          signatureHtml: content,
        },
      });
    } else {
      createMutation.mutate({
        name,
        signatureHtml: content,
      });
    }
  };

  const handleEdit = (signature: EmailSignature) => {
    setEditingSignature(signature);
    setName(signature.name);
    setContent(signature.signatureHtml);
  };

  const handleCancel = () => {
    setEditingSignature(null);
    setName('');
    setContent('');
  };

  const signatureContent = (
        
          
            
              Your Signatures
               {
                  setEditingSignature(null);
                  setName('');
                  setContent('');
                }}
                data-testid="button-new-signature"
              >
                
                New
              
            

            {isLoading ? (
              Loading...
            ) : signatures.length === 0 ? (
              
                
                  No signatures yet. Create one to get started!
                
              
            ) : (
              
                {signatures.map((sig) => (
                  
                    
                      
                        
                          {sig.name}
                          {sig.isDefault && (
                            
                              Default
                            
                          )}
                        
                        
                           {
                              e.stopPropagation();
                              setDefaultMutation.mutate(sig.id);
                            }}
                            data-testid={`button-set-default-${sig.id}`}
                          >
                            {sig.isDefault ? (
                              
                            ) : (
                              
                            )}
                          
                           {
                              e.stopPropagation();
                              handleEdit(sig);
                            }}
                            data-testid={`button-edit-${sig.id}`}
                          >
                            
                          
                           {
                              e.stopPropagation();
                              deleteMutation.mutate(sig.id);
                            }}
                            data-testid={`button-delete-${sig.id}`}
                          >
                            
                          
                        
                      
                    
                    
                      
                    
                  
                ))}
              
            )}
          

          
            
              {editingSignature ? 'Edit Signature' : 'Create Signature'}
            

            
              
                Name
                 setName(e.target.value)}
                  data-testid="input-signature-name"
                />
              

              
                Signature Content
                
              

              
                
                  {editingSignature ? 'Update' : 'Create'}
                
                {editingSignature && (
                  
                    Cancel
                  
                )}
              
            
          
        
  );

  if (embedded) {
    return signatureContent;
  }

  return (
    
      
        
          
          Manage Signatures
        
      
      
        
          Email Signatures
        
        {signatureContent}
      
    
  );
}