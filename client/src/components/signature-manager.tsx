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

export function SignatureManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState<EmailSignature | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const { toast } = useToast();

  const { data: signatures = [], isLoading } = useQuery<EmailSignature[]>({
    queryKey: ['/api/signatures'],
    enabled: isOpen,
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmailSignature> }) =>
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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="button-manage-signatures">
          <Settings className="h-4 w-4 mr-2" />
          Manage Signatures
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Signatures</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Your Signatures</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingSignature(null);
                  setName('');
                  setContent('');
                }}
                data-testid="button-new-signature"
              >
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : signatures.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No signatures yet. Create one to get started!
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {signatures.map((sig) => (
                  <Card
                    key={sig.id}
                    className={cn(
                      'cursor-pointer hover-elevate active-elevate-2',
                      editingSignature?.id === sig.id && 'border-primary'
                    )}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <CardTitle className="text-sm truncate">{sig.name}</CardTitle>
                          {sig.isDefault && (
                            <Badge variant="default" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultMutation.mutate(sig.id);
                            }}
                            data-testid={`button-set-default-${sig.id}`}
                          >
                            {sig.isDefault ? (
                              <Star className="h-4 w-4 fill-current text-yellow-500" />
                            ) : (
                              <StarOff className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(sig);
                            }}
                            data-testid={`button-edit-${sig.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(sig.id);
                            }}
                            data-testid={`button-delete-${sig.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div
                        className="text-xs text-muted-foreground prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: sig.signatureHtml }}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">
              {editingSignature ? 'Edit Signature' : 'Create Signature'}
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signature-name">Name</Label>
                <Input
                  id="signature-name"
                  placeholder="e.g., Professional, Casual"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-signature-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Signature Content</Label>
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                  placeholder="Your signature..."
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-signature"
                >
                  {editingSignature ? 'Update' : 'Create'}
                </Button>
                {editingSignature && (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
