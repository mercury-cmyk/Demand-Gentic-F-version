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
  onUpdate: (updates: Partial) => void;
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
          
            
              Heading Text
               updateContent('text', e.target.value)}
                placeholder="Enter heading text..."
                className="mt-1"
                rows={2}
              />
            
            
              Heading Level
               updateContent('level', v)}
              >
                
                  
                
                
                  H1 - Main Title
                  H2 - Section
                  H3 - Subsection
                  H4 - Minor
                
              
            
            
              Alignment
              
                {['left', 'center', 'right'].map(align => (
                   updateContent('align', align)}
                  >
                    {align === 'left' && }
                    {align === 'center' && }
                    {align === 'right' && }
                  
                ))}
              
            
          
        );

      case 'text':
        return (
          
            
              Text Content
               updateContent('text', e.target.value)}
                placeholder="Enter paragraph text..."
                className="mt-1"
                rows={6}
              />
              
                Use {'{{first_name}}'}, {'{{company}}'}, etc. for personalization
              
            
            
              Alignment
              
                {['left', 'center', 'right'].map(align => (
                   updateContent('align', align)}
                  >
                    {align === 'left' && }
                    {align === 'center' && }
                    {align === 'right' && }
                  
                ))}
              
            
          
        );

      case 'image':
        return (
          
            
              Image URL
              
                 updateContent('src', e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                
                  
                
              
            
            {block.content.src && (
              
                
              
            )}
            
              Alt Text
               updateContent('alt', e.target.value)}
                placeholder="Describe the image..."
                className="mt-1"
              />
            
            
              Width
               updateContent('width', v)}
              >
                
                  
                
                
                  Full Width
                  75%
                  50%
                  25%
                
              
            
            
              Link URL (optional)
               updateContent('link', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            
          
        );

      case 'button':
        return (
          
            
              Button Text
               updateContent('text', e.target.value)}
                placeholder="Click Here"
                className="mt-1"
              />
            
            
              Button URL
               updateContent('url', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            
            
              Alignment
              
                {['left', 'center', 'right'].map(align => (
                   updateContent('align', align)}
                  >
                    {align === 'left' && }
                    {align === 'center' && }
                    {align === 'right' && }
                  
                ))}
              
            
            
              Style
               updateContent('style', v)}
              >
                
                  
                
                
                  Primary
                  Secondary
                  Outline
                
              
            
            
              Button Color
               updateContent('backgroundColor', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer"
              />
            
          
        );

      case 'divider':
        return (
          
            
              Style
               updateContent('style', v)}
              >
                
                  
                
                
                  Solid
                  Dashed
                  Dotted
                
              
            
            
              Color
               updateContent('color', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer"
              />
            
          
        );

      case 'spacer':
        return (
          
            
              Height: {block.content.height || 24}px
               updateContent('height', v)}
                min={8}
                max={120}
                step={4}
                className="mt-2"
              />
            
          
        );

      case 'hero':
        return (
          
            
              Background Image
              
                 updateContent('backgroundImage', e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                
                  
                
              
            
            
              Title
               updateContent('title', e.target.value)}
                placeholder="Hero Title"
                className="mt-1"
              />
            
            
              Subtitle
               updateContent('subtitle', e.target.value)}
                placeholder="Hero subtitle text..."
                className="mt-1"
                rows={2}
              />
            
            
              Button Text
               updateContent('buttonText', e.target.value)}
                placeholder="Learn More"
                className="mt-1"
              />
            
            
              Button URL
               updateContent('buttonUrl', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            
          
        );

      case 'list':
        const items = block.content.items || ['Item 1', 'Item 2', 'Item 3'];
        return (
          
            
              List Style
               updateContent('style', v)}
              >
                
                  
                
                
                  Bullet Points
                  Numbered
                  Checkmarks
                
              
            
            
              Items
              
                {items.map((item: string, i: number) => (
                  
                     {
                        const newItems = [...items];
                        newItems[i] = e.target.value;
                        updateContent('items', newItems);
                      }}
                      placeholder={`Item ${i + 1}`}
                      className="flex-1"
                    />
                     {
                        const newItems = items.filter((_: any, idx: number) => idx !== i);
                        updateContent('items', newItems);
                      }}
                    >
                      
                    
                  
                ))}
                 updateContent('items', [...items, ''])}
                >
                  
                  Add Item
                
              
            
          
        );

      case 'social':
        const links = block.content.links || [];
        return (
          
            
              Social Links
              
                {links.map((link: any, i: number) => (
                  
                     {
                        const newLinks = [...links];
                        newLinks[i] = { ...link, platform: v };
                        updateContent('links', newLinks);
                      }}
                    >
                      
                        
                      
                      
                        LinkedIn
                        Twitter
                        Facebook
                        Instagram
                        YouTube
                      
                    
                     {
                        const newLinks = [...links];
                        newLinks[i] = { ...link, url: e.target.value };
                        updateContent('links', newLinks);
                      }}
                      placeholder="https://..."
                      className="flex-1"
                    />
                     {
                        const newLinks = links.filter((_: any, idx: number) => idx !== i);
                        updateContent('links', newLinks);
                      }}
                    >
                      
                    
                  
                ))}
                
                    updateContent('links', [...links, { platform: 'linkedin', url: '' }])
                  }
                >
                  
                  Add Link
                
              
            
          
        );

      case 'footer':
        return (
          
            
              Company Name
               updateContent('companyName', e.target.value)}
                placeholder="Your Company"
                className="mt-1"
              />
            
            
              Address
               updateContent('address', e.target.value)}
                placeholder="123 Business St, City, State 12345"
                className="mt-1"
                rows={2}
              />
            
            
              Include Unsubscribe Link
               updateContent('includeUnsubscribe', v)}
              />
            
          
        );

      default:
        return (
          
            No editor available for this block type.
          
        );
    }
  };

  return (
    
      {/* Header */}
      
        
          {block.type} Block
        
      

      {/* Content */}
      
        
          
            
              
                Content
              
              
                Visibility
              
            

            
              {renderBlockEditor()}
            

            
              
                
                  
                  Visible
                
                 onUpdate({ isVisible: v })}
                />
              
              
              
                
                  
                  Hide on Mobile
                
                 onUpdate({ hideOnMobile: v })}
                />
              
              
                
                  
                  Hide on Desktop
                
                 onUpdate({ hideOnDesktop: v })}
                />
              
            
          
        
      
    
  );
}

export default BlockEditor;