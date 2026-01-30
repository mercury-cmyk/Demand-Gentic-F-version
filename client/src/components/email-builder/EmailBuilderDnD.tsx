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
const BLOCK_LIBRARY: Array<{
  type: BlockType;
  name: string;
  icon: React.ComponentType<any>;
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
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [subject, setSubject] = useState(initialSubject);
  const [previewText, setPreviewText] = useState(initialPreviewText);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedBrandKit, setSelectedBrandKit] = useState<string | undefined>(brandKitId);
  const [isSaving, setIsSaving] = useState(false);

  const queryClient = useQueryClient();

  // Fetch brand kits
  const { data: brandKits = [] } = useQuery<BrandKit[]>({
    queryKey: ['brandKits'],
    queryFn: async () => {
      const res = await fetch('/api/email-builder/brand-kits');
      if (!res.ok) throw new Error('Failed to fetch brand kits');
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
  const updateBlock = useCallback((blockId: string, updates: Partial<EmailBlock>) => {
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
      if (newIndex < 0 || newIndex >= prev.length) return prev;

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
    <div className="h-full flex flex-col bg-slate-50">
      {/* Top Toolbar */}
      <div className="border-b bg-white px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          {/* Subject Line */}
          <div className="flex-1 max-w-lg">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-slate-500 whitespace-nowrap">Subject</Label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line..."
                className="text-sm h-8 border-slate-200"
              />
            </div>
          </div>

          {/* Preview Text */}
          <div className="flex-1 max-w-sm">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-slate-500 whitespace-nowrap">Preview</Label>
              <Input
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                placeholder="Preview text..."
                className="text-sm h-8 border-slate-200"
              />
            </div>
          </div>

          {/* Brand Kit Selector */}
          <Select value={selectedBrandKit} onValueChange={setSelectedBrandKit}>
            <SelectTrigger className="w-40 h-8">
              <Palette className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Brand Kit" />
            </SelectTrigger>
            <SelectContent>
              {brandKits.map(kit => (
                <SelectItem key={kit.id} value={kit.id}>
                  {kit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewMode(prev => (prev === 'desktop' ? 'mobile' : 'desktop'))}
          >
            {previewMode === 'desktop' ? (
              <Smartphone className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="w-4 h-4 mr-1" />
            Preview
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Block Library */}
        <div className="w-60 border-r bg-white flex flex-col">
          <div className="p-3 border-b">
            <h3 className="text-sm font-semibold text-slate-700">Add Blocks</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {BLOCK_LIBRARY.map(block => (
                <button
                  key={block.type}
                  onClick={() => addBlock(block.type)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                    <block.icon className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700">{block.name}</div>
                    <div className="text-xs text-slate-500 truncate">{block.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* AI Image Generator Button */}
          <div className="p-3 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAIPanel(true)}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              AI Image Generator
            </Button>
          </div>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 overflow-auto p-6 flex justify-center">
          <div
            className={`${
              previewMode === 'mobile' ? 'w-[375px]' : 'w-[600px]'
            } bg-white rounded-lg shadow-lg border min-h-[600px] flex flex-col transition-all duration-300`}
          >
            {/* Email Canvas */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map(b => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex-1">
                  {blocks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                      <Plus className="w-12 h-12 mb-4" />
                      <p className="text-lg font-medium">Start Building</p>
                      <p className="text-sm text-center mt-2">
                        Drag blocks from the left panel or click to add them to your email
                      </p>
                    </div>
                  ) : (
                    <div className="p-4">
                      {blocks.map(block => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          isSelected={selectedBlockId === block.id}
                          brandKit={currentBrandKit}
                          onClick={() => setSelectedBlockId(block.id)}
                          onDelete={() => deleteBlock(block.id)}
                          onDuplicate={() => duplicateBlock(block.id)}
                          onMoveUp={() => moveBlock(block.id, 'up')}
                          onMoveDown={() => moveBlock(block.id, 'down')}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </SortableContext>

              <DragOverlay>
                {activeId ? (
                  <div className="bg-white shadow-lg rounded-lg p-4 opacity-80">
                    <p className="text-sm text-slate-600">Moving block...</p>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* Right Sidebar - Block Editor */}
        <div className="w-72 border-l bg-white flex flex-col">
          {selectedBlock ? (
            <BlockEditor
              block={selectedBlock}
              brandKit={currentBrandKit}
              onUpdate={updates => updateBlock(selectedBlock.id, updates)}
              onOpenAIPanel={() => setShowAIPanel(true)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
              <Settings className="w-8 h-8 mb-3" />
              <p className="text-sm text-center">Select a block to edit its properties</p>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[85vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview how your email will look
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-100 rounded-lg p-4">
            <div className="max-w-[600px] mx-auto bg-white rounded shadow">
              {/* Render preview HTML here */}
              <div className="p-6">
                <p className="text-slate-500 text-center">Preview rendering...</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Image Panel */}
      <Sheet open={showAIPanel} onOpenChange={setShowAIPanel}>
        <SheetContent side="right" className="w-[450px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" />
              AI Image Generator
            </SheetTitle>
          </SheetHeader>
          <AIImagePanel onImageGenerated={handleAIImageGenerated} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default EmailBuilderDnD;
