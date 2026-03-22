/**
 * OrderContextPanel
 * Collapsible panel for adding context files and URLs to an order
 * Used within the AgentC chat interface for order creation
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Upload,
  FileText,
  Users,
  Ban,
  Mail,
  Plus,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { UploadedFile } from './order-agent-types';

type FileCategory = 'context' | 'target_accounts' | 'suppression' | 'template';

interface OrderContextPanelProps {
  contextUrls: string[];
  onAddUrl: (url: string) => void;
  onRemoveUrl: (url: string) => void;
  uploadedFiles: UploadedFile[];
  targetAccountFiles: UploadedFile[];
  suppressionFiles: UploadedFile[];
  templateFiles: UploadedFile[];
  onUploadFiles: (files: FileList, category: FileCategory) => Promise<void>;
  onRemoveFile: (key: string, category: FileCategory) => void;
  isUploading: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function OrderContextPanel({
  contextUrls,
  onAddUrl,
  onRemoveUrl,
  uploadedFiles,
  targetAccountFiles,
  suppressionFiles,
  templateFiles,
  onUploadFiles,
  onRemoveFile,
  isUploading,
  isExpanded = false,
  onExpandedChange,
}: OrderContextPanelProps) {
  const { toast } = useToast();
  const [newUrl, setNewUrl] = useState('');
  const [expanded, setExpanded] = useState(isExpanded);

  const contextFileInputRef = useRef<HTMLInputElement>(null);
  const targetAccountsInputRef = useRef<HTMLInputElement>(null);
  const suppressionInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const handleExpandedChange = (value: boolean) => {
    setExpanded(value);
    onExpandedChange?.(value);
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;

    let formattedUrl = newUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    if (contextUrls.includes(formattedUrl)) {
      toast({ title: 'URL already added', variant: 'destructive' });
      return;
    }

    onAddUrl(formattedUrl);
    setNewUrl('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, category: FileCategory) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      await onUploadFiles(files, category);
    } catch (error) {
      console.error('File upload error:', error);
    }

    // Reset input
    e.target.value = '';
  };

  const totalItems = contextUrls.length + uploadedFiles.length +
    targetAccountFiles.length + suppressionFiles.length + templateFiles.length;

  const fileCategories = [
    {
      id: 'context' as FileCategory,
      label: 'Context Documents',
      description: 'PDFs, docs about your product or goals',
      icon: FileText,
      files: uploadedFiles,
      inputRef: contextFileInputRef,
      accept: '.pdf,.doc,.docx,.txt,.csv',
    },
    {
      id: 'target_accounts' as FileCategory,
      label: 'Target Accounts',
      description: 'List of accounts to target',
      icon: Users,
      files: targetAccountFiles,
      inputRef: targetAccountsInputRef,
      accept: '.csv,.xlsx,.xls',
    },
    {
      id: 'suppression' as FileCategory,
      label: 'Suppression Lists',
      description: 'Contacts/domains to exclude',
      icon: Ban,
      files: suppressionFiles,
      inputRef: suppressionInputRef,
      accept: '.csv,.xlsx,.xls',
    },
    {
      id: 'template' as FileCategory,
      label: 'Email/Call Templates',
      description: 'Custom messaging templates',
      icon: Mail,
      files: templateFiles,
      inputRef: templateInputRef,
      accept: '.pdf,.doc,.docx,.txt',
    },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
      <Collapsible open={expanded} onOpenChange={handleExpandedChange}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between px-4 py-3 h-auto hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span>Add Context</span>
              {totalItems > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalItems} item{totalItems !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            <div className="h-px bg-border/50" />

            {/* URL Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <LinkIcon className="h-3 w-3" />
                Website URLs
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  className="text-sm h-9"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddUrl}
                  disabled={!newUrl.trim()}
                  className="h-9 px-3"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* URL List */}
              <AnimatePresence mode="popLayout">
                {contextUrls.map((url) => (
                  <motion.div
                    key={url}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-xs bg-background/50 px-2 py-1.5 rounded border border-border/50"
                  >
                    <LinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{url}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => onRemoveUrl(url)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* File Upload Categories */}
            <div className="grid gap-3">
              {fileCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <div key={category.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Icon className="h-3 w-3" />
                        {category.label}
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => category.inputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Upload className="h-3 w-3 mr-1" />
                            Upload
                          </>
                        )}
                      </Button>
                      <input
                        ref={category.inputRef}
                        type="file"
                        multiple
                        accept={category.accept}
                        onChange={(e) => handleFileChange(e, category.id)}
                        className="hidden"
                      />
                    </div>

                    {/* Uploaded Files */}
                    <AnimatePresence mode="popLayout">
                      {category.files.map((file) => (
                        <motion.div
                          key={file.key}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-2 text-xs bg-background/50 px-2 py-1.5 rounded border border-border/50"
                        >
                          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0"
                            onClick={() => onRemoveFile(file.key, category.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {category.files.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 italic">
                        {category.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
