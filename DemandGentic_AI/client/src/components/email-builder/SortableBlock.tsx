/**
 * SortableBlock - Draggable email block wrapper
 *
 * Renders email blocks with drag handles and action buttons
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { EmailBlock, BrandKit } from './EmailBuilderDnD';

interface SortableBlockProps {
  block: EmailBlock;
  isSelected: boolean;
  brandKit?: BrandKit;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function SortableBlock({
  block,
  isSelected,
  brandKit,
  onClick,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get brand colors
  const primaryColor = brandKit?.primaryColor || '#2563eb';
  const textColor = brandKit?.textColor || '#1f2937';
  const linkColor = brandKit?.linkColor || '#2563eb';

  // Render block content based on type
  const renderContent = () => {
    switch (block.type) {
      case 'heading':
        const HeadingTag = (block.content.level || 'h2') as keyof JSX.IntrinsicElements;
        const headingStyles: Record = {
          h1: 'text-3xl font-bold',
          h2: 'text-2xl font-bold',
          h3: 'text-xl font-semibold',
          h4: 'text-lg font-semibold',
        };
        return (
          
            {block.content.text || 'Heading'}
          
        );

      case 'text':
        return (
          
            {block.content.text || 'Enter your text here...'}
          
        );

      case 'image':
        return (
          
            {block.content.src ? (
              
            ) : (
              
                
                  🖼️
                  Click to add an image
                
              
            )}
          
        );

      case 'button':
        const buttonAlign = block.content.align || 'center';
        const alignClass =
          buttonAlign === 'left'
            ? 'justify-start'
            : buttonAlign === 'right'
            ? 'justify-end'
            : 'justify-center';
        return (
          
            
              {block.content.text || 'Click Here'}
            
          
        );

      case 'divider':
        return (
          
        );

      case 'spacer':
        return (
          
            {block.content.height || 24}px spacer
          
        );

      case 'hero':
        return (
          
            
              {block.content.title || 'Hero Title'}
            
            
              {block.content.subtitle || 'Hero subtitle text'}
            
            {block.content.buttonText && (
              
                {block.content.buttonText}
              
            )}
          
        );

      case 'columns':
        return (
          
            {(block.content.columns || [{ content: 'Column 1' }, { content: 'Column 2' }]).map(
              (col: any, i: number) => (
                
                  {col.content}
                
              )
            )}
          
        );

      case 'list':
        const ListTag = block.content.style === 'numbered' ? 'ol' : 'ul';
        return (
          
            {(block.content.items || ['Item 1', 'Item 2', 'Item 3']).map(
              (item: string, i: number) => (
                
                  {item}
                
              )
            )}
          
        );

      case 'social':
        const socialIcons: Record = {
          linkedin: '🔗',
          twitter: '🐦',
          facebook: '📘',
          instagram: '📷',
          youtube: '▶️',
        };
        return (
          
            {(block.content.links || []).map((link: any, i: number) => (
              
                {socialIcons[link.platform] || '🔗'}
              
            ))}
            {(!block.content.links || block.content.links.length === 0) && (
              Add social media links
            )}
          
        );

      case 'footer':
        return (
          
            {block.content.companyName || 'Your Company'}
            {block.content.address || '123 Business St, City, State 12345'}
            {block.content.includeUnsubscribe && (
              
                
                  Unsubscribe
                
                {' | '}
                
                  Manage Preferences
                
              
            )}
          
        );

      default:
        return (
          
            Unknown block type: {block.type}
          
        );
    }
  };

  return (
    
      {/* Block Actions (visible on hover/select) */}
      
        {/* Drag Handle */}
        
          
        

        {/* Move Up */}
         {
            e.stopPropagation();
            onMoveUp();
          }}
          className="p-1 rounded hover:bg-slate-100"
        >
          
        

        {/* Move Down */}
         {
            e.stopPropagation();
            onMoveDown();
          }}
          className="p-1 rounded hover:bg-slate-100"
        >
          
        
      

      {/* More Actions (top right) */}
      
        
          
            
              
            
          
          
            
              
              Duplicate
            
            
            
              
              Delete
            
          
        
      

      {/* Block Content */}
      {renderContent()}

      {/* Block Type Label (on hover) */}
      
        {block.type}
      
    
  );
}

export default SortableBlock;