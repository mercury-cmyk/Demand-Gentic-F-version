/**
 * EmailBuilderDnD - Drag & Drop Email Builder
 *
 * A modern, block-based email builder with:
 * - Drag-and-drop block reordering
 * - Real-time preview
 * - AI image generation
 * - Brand kit integration
 * - Mobile-responsive editing
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Type,
  Heading,
  Image,
  MousePointer,
  Minus,
  Columns,
  LayoutTemplate,
  Share2,
  FileText,
  List,
  Quote,
  Plus,
  Trash2,
  Copy,
  Eye,
  Save,
  Send,
  Smartphone,
  Monitor,
  Palette,
  Wand2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Settings,
  Undo,
  Redo,
  Loader2,
} from 'lucide-react';
import { SortableBlock } from './SortableBlock';
import { BlockEditor } from './BlockEditor';
import { AIImagePanel } from './AIImagePanel';

// Types
export type BlockType =
  | 'text'
  | 'heading'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'columns'
  | 'hero'
  | 'social'
  | 'footer'
  | 'list';

export interface EmailBlock {
  id: string;
  type: BlockType;
  content: any;
  styles?: any;
  mobileStyles?: any;
  isVisible?: boolean;
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
}

export interface BrandKit {
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
}

interface EmailBuilderDnDProps {
  templateId?: string;
  initialBlocks?: EmailBlock[];
  initialSubject?: string;
  initialPreviewText?: string;
  brandKitId?: string;
  onSave?: (data: { blocks: EmailBlock[]; subject: string; previewText: string }) => void;
}

// Block Library Definition
const BLOCK_LIBRARY: Array;
  description: string;
  defaultContent: any;
}> = [
  {
    type: 'heading',
    name: 'Heading',
    icon: Heading,
    description: 'Add a title or section header',
    defaultContent: { text: 'Your Heading Here', level: 'h2' },
  },
  {
    type: 'text',
    name: 'Text',
    icon: Type,
    description: 'Add paragraph text',
    defaultContent: { text: 'Enter your text content here. You can add personalization tokens like {{first_name}}.' },
  },
  {
    type: 'image',
    name: 'Image',
    icon: Image,
    description: 'Add an image',
    defaultContent: { src: '', alt: '', width: '100%', link: '' },
  },
  {
    type: 'button',
    name: 'Button',
    icon: MousePointer,
    description: 'Add a call-to-action button',
    defaultContent: { text: 'Click Here', url: 'https://', align: 'center', style: 'primary' },
  },
  {
    type: 'divider',
    name: 'Divider',
    icon: Minus,
    description: 'Add a horizontal line',
    defaultContent: { style: 'solid', color: '#e5e7eb' },
  },
  {
    type: 'spacer',
    name: 'Spacer',
    icon: LayoutTemplate,
    description: 'Add vertical spacing',
    defaultContent: { height: 24 },
  },
  {
    type: 'hero',
    name: 'Hero Banner',
    icon: LayoutTemplate,
    description: 'Add a hero section with image and text',
    defaultContent: {
      backgroundImage: '',
      title: 'Hero Title',
      subtitle: 'Hero subtitle text goes here',
      buttonText: 'Learn More',
      buttonUrl: 'https://',
    },
  },
  {
    type: 'columns',
    name: 'Columns',
    icon: Columns,
    description: 'Add a two-column layout',
    defaultContent: { columns: [{ content: 'Column 1' }, { content: 'Column 2' }] },
  },
  {
    type: 'list',
    name: 'List',
    icon: List,
    description: 'Add a bulleted or numbered list',
    defaultContent: { items: ['Item 1', 'Item 2', 'Item 3'], style: 'bullet' },
  },
  {
    type: 'social',
    name: 'Social Links',
    icon: Share2,
    description: 'Add social media icons',
    defaultContent: {
      links: [
        { platform: 'linkedin', url: 'https://' },
        { platform: 'twitter', url: 'https://' },
      ],
    },
  },
  {
    type: 'footer',
    name: 'Footer',
    icon: FileText,
    description: 'Add a footer with company info',
    defaultContent: {
      companyName: 'Your Company',
      address: '123 Business St, City, State 12345',
      includeUnsubscribe: true,
    },
  },
];

export function EmailBuilderDnD({
  templateId,
  initialBlocks = [],
  initialSubject = '',
  initialPreviewText = '',
  brandKitId,
  onSave,
}: EmailBuilderDnDProps) {
  // State
  const [blocks, setBlocks] = useState(initialBlocks);
  const [subject, setSubject] = useState(initialSubject);
  const [previewText, setPreviewText] = useState(initialPreviewText);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedBrandKit, setSelectedBrandKit] = useState(brandKitId);
  const [isSaving, setIsSaving] = useState(false);

  const queryClient = useQueryClient();

  // Fetch brand kits
  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandKits'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/email-builder/brand-kits');
      return res.json();
    },
  });

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Generate unique ID
  const generateId = () => `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add new block
  const addBlock = useCallback((type: BlockType, insertIndex?: number) => {
    const blockDef = BLOCK_LIBRARY.find(b => b.type === type);
    if (!blockDef) return;

    const newBlock: EmailBlock = {
      id: generateId(),
      type,
      content: { ...blockDef.defaultContent },
      isVisible: true,
    };

    setBlocks(prev => {
      if (insertIndex !== undefined) {
        const newBlocks = [...prev];
        newBlocks.splice(insertIndex, 0, newBlock);
        return newBlocks;
      }
      return [...prev, newBlock];
    });
    setSelectedBlockId(newBlock.id);
  }, []);

  // Delete block
  const deleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  }, [selectedBlockId]);

  // Duplicate block
  const duplicateBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === blockId);
      if (index === -1) return prev;

      const block = prev[index];
      const newBlock: EmailBlock = {
        ...block,
        id: generateId(),
        content: { ...block.content },
      };

      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });
  }, []);

  // Update block
  const updateBlock = useCallback((blockId: string, updates: Partial) => {
    setBlocks(prev =>
      prev.map(b => (b.id === blockId ? { ...b, ...updates } : b))
    );
  }, []);

  // Move block
  const moveBlock = useCallback((blockId: string, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === blockId);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex = prev.length) return prev;

      return arrayMove(prev, index, newIndex);
    });
  }, []);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setBlocks(prev => {
        const oldIndex = prev.findIndex(b => b.id === active.id);
        const newIndex = prev.findIndex(b => b.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // Handle image from AI panel
  const handleAIImageGenerated = useCallback((imageUrl: string, altText: string) => {
    if (selectedBlockId) {
      const block = blocks.find(b => b.id === selectedBlockId);
      if (block?.type === 'image' || block?.type === 'hero') {
        updateBlock(selectedBlockId, {
          content: {
            ...block.content,
            src: imageUrl,
            backgroundImage: imageUrl,
            alt: altText,
          },
        });
      }
    } else {
      // Add new image block
      const newBlock: EmailBlock = {
        id: generateId(),
        type: 'image',
        content: { src: imageUrl, alt: altText, width: '100%' },
        isVisible: true,
      };
      setBlocks(prev => [...prev, newBlock]);
      setSelectedBlockId(newBlock.id);
    }
    setShowAIPanel(false);
  }, [selectedBlockId, blocks, updateBlock]);

  // Save template
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        onSave({ blocks, subject, previewText });
      } else if (templateId) {
        // Save to API
        await fetch(`/api/email-builder/templates/${templateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            previewText,
            brandKitId: selectedBrandKit,
          }),
        });

        // Save blocks
        await fetch('/api/email-builder/blocks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            blockOrders: blocks.map((b, i) => ({ blockId: b.id, sortOrder: i })),
          }),
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Get selected block
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);
  const currentBrandKit = brandKits.find(k => k.id === selectedBrandKit);

  return (
    
      {/* Top Toolbar */}
      
        
          {/* Subject Line */}
          
            
              Subject
               setSubject(e.target.value)}
                placeholder="Email subject line..."
                className="text-sm h-8 border-slate-200"
              />
            
          

          {/* Preview Text */}
          
            
              Preview
               setPreviewText(e.target.value)}
                placeholder="Preview text..."
                className="text-sm h-8 border-slate-200"
              />
            
          

          {/* Brand Kit Selector */}
          
            
              
              
            
            
              {brandKits.map(kit => (
                
                  {kit.name}
                
              ))}
            
          
        

        {/* Actions */}
        
           setPreviewMode(prev => (prev === 'desktop' ? 'mobile' : 'desktop'))}
          >
            {previewMode === 'desktop' ? (
              
            ) : (
              
            )}
          
           setShowPreview(true)}>
            
            Preview
          
          
          
            {isSaving ? (
              
            ) : (
              
            )}
            Save
          
        
      

      {/* Main Content */}
      
        {/* Left Sidebar - Block Library */}
        
          
            Add Blocks
          
          
            
              {BLOCK_LIBRARY.map(block => (
                 addBlock(block.type)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  
                    
                  
                  
                    {block.name}
                    {block.description}
                  
                
              ))}
            
          

          {/* AI Image Generator Button */}
          
             setShowAIPanel(true)}
            >
              
              AI Image Generator
            
          
        

        {/* Center - Canvas */}
        
          
            {/* Email Canvas */}
            
               b.id)}
                strategy={verticalListSortingStrategy}
              >
                
                  {blocks.length === 0 ? (
                    
                      
                      Start Building
                      
                        Drag blocks from the left panel or click to add them to your email
                      
                    
                  ) : (
                    
                      {blocks.map(block => (
                         setSelectedBlockId(block.id)}
                          onDelete={() => deleteBlock(block.id)}
                          onDuplicate={() => duplicateBlock(block.id)}
                          onMoveUp={() => moveBlock(block.id, 'up')}
                          onMoveDown={() => moveBlock(block.id, 'down')}
                        />
                      ))}
                    
                  )}
                
              

              
                {activeId ? (
                  
                    Moving block...
                  
                ) : null}
              
            
          
        

        {/* Right Sidebar - Block Editor */}
        
          {selectedBlock ? (
             updateBlock(selectedBlock.id, updates)}
              onOpenAIPanel={() => setShowAIPanel(true)}
            />
          ) : (
            
              
              Select a block to edit its properties
            
          )}
        
      

      {/* Preview Modal */}
      
        
          
            Email Preview
            
              Preview how your email will look
            
          
          
            
              {/* Render preview HTML here */}
              
                Preview rendering...
              
            
          
        
      

      {/* AI Image Panel */}
      
        
          
            
              
              AI Image Generator
            
          
          
        
      
    
  );
}

export default EmailBuilderDnD;