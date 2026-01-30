/**
 * BlockEditor - Block-specific property editor
 *
 * Provides editing UI for each block type's properties
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Trash2,
  Wand2,
  Image,
  Link,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
} from 'lucide-react';
import type { EmailBlock, BrandKit } from './EmailBuilderDnD';

interface BlockEditorProps {
  block: EmailBlock;
  brandKit?: BrandKit;
  onUpdate: (updates: Partial<EmailBlock>) => void;
  onOpenAIPanel: () => void;
}

export function BlockEditor({
  block,
  brandKit,
  onUpdate,
  onOpenAIPanel,
}: BlockEditorProps) {
  const updateContent = (key: string, value: any) => {
    onUpdate({
      content: { ...block.content, [key]: value },
    });
  };

  const updateStyles = (key: string, value: any) => {
    onUpdate({
      styles: { ...block.styles, [key]: value },
    });
  };

  // Render editor for specific block type
  const renderBlockEditor = () => {
    switch (block.type) {
      case 'heading':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Heading Text</Label>
              <Textarea
                value={block.content.text || ''}
                onChange={e => updateContent('text', e.target.value)}
                placeholder="Enter heading text..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs">Heading Level</Label>
              <Select
                value={block.content.level || 'h2'}
                onValueChange={v => updateContent('level', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h1">H1 - Main Title</SelectItem>
                  <SelectItem value="h2">H2 - Section</SelectItem>
                  <SelectItem value="h3">H3 - Subsection</SelectItem>
                  <SelectItem value="h4">H4 - Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Alignment</Label>
              <div className="flex gap-1 mt-1">
                {['left', 'center', 'right'].map(align => (
                  <Button
                    key={align}
                    variant={block.content.align === align ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => updateContent('align', align)}
                  >
                    {align === 'left' && <AlignLeft className="w-4 h-4" />}
                    {align === 'center' && <AlignCenter className="w-4 h-4" />}
                    {align === 'right' && <AlignRight className="w-4 h-4" />}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Text Content</Label>
              <Textarea
                value={block.content.text || ''}
                onChange={e => updateContent('text', e.target.value)}
                placeholder="Enter paragraph text..."
                className="mt-1"
                rows={6}
              />
              <p className="text-xs text-slate-500 mt-1">
                Use {'{{first_name}}'}, {'{{company}}'}, etc. for personalization
              </p>
            </div>
            <div>
              <Label className="text-xs">Alignment</Label>
              <div className="flex gap-1 mt-1">
                {['left', 'center', 'right'].map(align => (
                  <Button
                    key={align}
                    variant={block.content.align === align ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => updateContent('align', align)}
                  >
                    {align === 'left' && <AlignLeft className="w-4 h-4" />}
                    {align === 'center' && <AlignCenter className="w-4 h-4" />}
                    {align === 'right' && <AlignRight className="w-4 h-4" />}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Image URL</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={block.content.src || ''}
                  onChange={e => updateContent('src', e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={onOpenAIPanel}>
                  <Wand2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {block.content.src && (
              <div className="rounded border overflow-hidden">
                <img
                  src={block.content.src}
                  alt=""
                  className="w-full h-32 object-cover"
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Alt Text</Label>
              <Input
                value={block.content.alt || ''}
                onChange={e => updateContent('alt', e.target.value)}
                placeholder="Describe the image..."
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Width</Label>
              <Select
                value={block.content.width || '100%'}
                onValueChange={v => updateContent('width', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100%">Full Width</SelectItem>
                  <SelectItem value="75%">75%</SelectItem>
                  <SelectItem value="50%">50%</SelectItem>
                  <SelectItem value="25%">25%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Link URL (optional)</Label>
              <Input
                value={block.content.link || ''}
                onChange={e => updateContent('link', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'button':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Button Text</Label>
              <Input
                value={block.content.text || ''}
                onChange={e => updateContent('text', e.target.value)}
                placeholder="Click Here"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Button URL</Label>
              <Input
                value={block.content.url || ''}
                onChange={e => updateContent('url', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Alignment</Label>
              <div className="flex gap-1 mt-1">
                {['left', 'center', 'right'].map(align => (
                  <Button
                    key={align}
                    variant={block.content.align === align ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => updateContent('align', align)}
                  >
                    {align === 'left' && <AlignLeft className="w-4 h-4" />}
                    {align === 'center' && <AlignCenter className="w-4 h-4" />}
                    {align === 'right' && <AlignRight className="w-4 h-4" />}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Style</Label>
              <Select
                value={block.content.style || 'primary'}
                onValueChange={v => updateContent('style', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="outline">Outline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Button Color</Label>
              <Input
                type="color"
                value={block.content.backgroundColor || brandKit?.primaryColor || '#2563eb'}
                onChange={e => updateContent('backgroundColor', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer"
              />
            </div>
          </div>
        );

      case 'divider':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Style</Label>
              <Select
                value={block.content.style || 'solid'}
                onValueChange={v => updateContent('style', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="dotted">Dotted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <Input
                type="color"
                value={block.content.color || '#e5e7eb'}
                onChange={e => updateContent('color', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer"
              />
            </div>
          </div>
        );

      case 'spacer':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Height: {block.content.height || 24}px</Label>
              <Slider
                value={[block.content.height || 24]}
                onValueChange={([v]) => updateContent('height', v)}
                min={8}
                max={120}
                step={4}
                className="mt-2"
              />
            </div>
          </div>
        );

      case 'hero':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Background Image</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={block.content.backgroundImage || ''}
                  onChange={e => updateContent('backgroundImage', e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={onOpenAIPanel}>
                  <Wand2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={block.content.title || ''}
                onChange={e => updateContent('title', e.target.value)}
                placeholder="Hero Title"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Subtitle</Label>
              <Textarea
                value={block.content.subtitle || ''}
                onChange={e => updateContent('subtitle', e.target.value)}
                placeholder="Hero subtitle text..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs">Button Text</Label>
              <Input
                value={block.content.buttonText || ''}
                onChange={e => updateContent('buttonText', e.target.value)}
                placeholder="Learn More"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Button URL</Label>
              <Input
                value={block.content.buttonUrl || ''}
                onChange={e => updateContent('buttonUrl', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'list':
        const items = block.content.items || ['Item 1', 'Item 2', 'Item 3'];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">List Style</Label>
              <Select
                value={block.content.style || 'bullet'}
                onValueChange={v => updateContent('style', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bullet">Bullet Points</SelectItem>
                  <SelectItem value="numbered">Numbered</SelectItem>
                  <SelectItem value="checkmark">Checkmarks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Items</Label>
              <div className="space-y-2 mt-2">
                {items.map((item: string, i: number) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={e => {
                        const newItems = [...items];
                        newItems[i] = e.target.value;
                        updateContent('items', newItems);
                      }}
                      placeholder={`Item ${i + 1}`}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newItems = items.filter((_: any, idx: number) => idx !== i);
                        updateContent('items', newItems);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => updateContent('items', [...items, ''])}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>
            </div>
          </div>
        );

      case 'social':
        const links = block.content.links || [];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Social Links</Label>
              <div className="space-y-2 mt-2">
                {links.map((link: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <Select
                      value={link.platform}
                      onValueChange={v => {
                        const newLinks = [...links];
                        newLinks[i] = { ...link, platform: v };
                        updateContent('links', newLinks);
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="twitter">Twitter</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={link.url}
                      onChange={e => {
                        const newLinks = [...links];
                        newLinks[i] = { ...link, url: e.target.value };
                        updateContent('links', newLinks);
                      }}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newLinks = links.filter((_: any, idx: number) => idx !== i);
                        updateContent('links', newLinks);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    updateContent('links', [...links, { platform: 'linkedin', url: '' }])
                  }
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Link
                </Button>
              </div>
            </div>
          </div>
        );

      case 'footer':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Company Name</Label>
              <Input
                value={block.content.companyName || ''}
                onChange={e => updateContent('companyName', e.target.value)}
                placeholder="Your Company"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Textarea
                value={block.content.address || ''}
                onChange={e => updateContent('address', e.target.value)}
                placeholder="123 Business St, City, State 12345"
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Include Unsubscribe Link</Label>
              <Switch
                checked={block.content.includeUnsubscribe !== false}
                onCheckedChange={v => updateContent('includeUnsubscribe', v)}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-slate-500">
            No editor available for this block type.
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 capitalize">
          {block.type} Block
        </h3>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <Tabs defaultValue="content">
            <TabsList className="w-full">
              <TabsTrigger value="content" className="flex-1 text-xs">
                Content
              </TabsTrigger>
              <TabsTrigger value="visibility" className="flex-1 text-xs">
                Visibility
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-4">
              {renderBlockEditor()}
            </TabsContent>

            <TabsContent value="visibility" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Visible
                </Label>
                <Switch
                  checked={block.isVisible !== false}
                  onCheckedChange={v => onUpdate({ isVisible: v })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Hide on Mobile
                </Label>
                <Switch
                  checked={block.hideOnMobile === true}
                  onCheckedChange={v => onUpdate({ hideOnMobile: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  Hide on Desktop
                </Label>
                <Switch
                  checked={block.hideOnDesktop === true}
                  onCheckedChange={v => onUpdate({ hideOnDesktop: v })}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

export default BlockEditor;
