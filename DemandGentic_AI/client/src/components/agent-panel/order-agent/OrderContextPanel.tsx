/**
 * OrderContextPanel
 * Collapsible panel for adding context files and URLs to an order
 * Used within the AgentX chat interface for order creation
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
  onUploadFiles: (files: FileList, category: FileCategory) => Promise;
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

  const contextFileInputRef = useRef(null);
  const targetAccountsInputRef = useRef(null);
  const suppressionInputRef = useRef(null);
  const templateInputRef = useRef(null);

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

  const handleFileChange = async (e: React.ChangeEvent, category: FileCategory) => {
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
    
      
        
          
            
              
              Add Context
              {totalItems > 0 && (
                
                  {totalItems} item{totalItems !== 1 ? 's' : ''}
                
              )}
            
            {expanded ? (
              
            ) : (
              
            )}
          
        

        
          
            

            {/* URL Input */}
            
              
                
                Website URLs
              
              
                 setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  className="text-sm h-9"
                />
                
                  
                
              

              {/* URL List */}
              
                {contextUrls.map((url) => (
                  
                    
                    {url}
                     onRemoveUrl(url)}
                    >
                      
                    
                  
                ))}
              
            

            {/* File Upload Categories */}
            
              {fileCategories.map((category) => {
                const Icon = category.icon;
                return (
                  
                    
                      
                        
                        {category.label}
                      
                       category.inputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          
                        ) : (
                          <>
                            
                            Upload
                          
                        )}
                      
                       handleFileChange(e, category.id)}
                        className="hidden"
                      />
                    

                    {/* Uploaded Files */}
                    
                      {category.files.map((file) => (
                        
                          
                          {file.name}
                           onRemoveFile(file.key, category.id)}
                          >
                            
                          
                        
                      ))}
                    

                    {category.files.length === 0 && (
                      
                        {category.description}
                      
                    )}
                  
                );
              })}
            
          
        
      
    
  );
}