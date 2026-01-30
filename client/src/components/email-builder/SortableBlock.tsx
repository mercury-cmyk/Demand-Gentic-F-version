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
        const headingStyles: Record<string, string> = {
          h1: 'text-3xl font-bold',
          h2: 'text-2xl font-bold',
          h3: 'text-xl font-semibold',
          h4: 'text-lg font-semibold',
        };
        return (
          <div
            className={headingStyles[block.content.level || 'h2']}
            style={{ color: textColor }}
          >
            {block.content.text || 'Heading'}
          </div>
        );

      case 'text':
        return (
          <p className="text-base leading-relaxed" style={{ color: textColor }}>
            {block.content.text || 'Enter your text here...'}
          </p>
        );

      case 'image':
        return (
          <div className="flex justify-center">
            {block.content.src ? (
              <img
                src={block.content.src}
                alt={block.content.alt || ''}
                className="max-w-full h-auto rounded"
                style={{ width: block.content.width || '100%' }}
              />
            ) : (
              <div className="w-full h-48 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖼️</div>
                  <p className="text-sm">Click to add an image</p>
                </div>
              </div>
            )}
          </div>
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
          <div className={`flex ${alignClass}`}>
            <div
              className="inline-block px-6 py-3 rounded font-semibold text-white cursor-pointer"
              style={{ backgroundColor: primaryColor }}
            >
              {block.content.text || 'Click Here'}
            </div>
          </div>
        );

      case 'divider':
        return (
          <hr
            className="my-4"
            style={{
              borderColor: block.content.color || '#e5e7eb',
              borderStyle: block.content.style || 'solid',
            }}
          />
        );

      case 'spacer':
        return (
          <div
            className="bg-slate-50 rounded border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400"
            style={{ height: block.content.height || 24 }}
          >
            {block.content.height || 24}px spacer
          </div>
        );

      case 'hero':
        return (
          <div
            className="rounded-lg p-8 text-center"
            style={{
              backgroundImage: block.content.backgroundImage
                ? `url(${block.content.backgroundImage})`
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <h2 className="text-2xl font-bold text-white mb-2">
              {block.content.title || 'Hero Title'}
            </h2>
            <p className="text-white/90 mb-4">
              {block.content.subtitle || 'Hero subtitle text'}
            </p>
            {block.content.buttonText && (
              <div className="inline-block px-6 py-2 bg-white text-slate-800 rounded font-semibold">
                {block.content.buttonText}
              </div>
            )}
          </div>
        );

      case 'columns':
        return (
          <div className="grid grid-cols-2 gap-4">
            {(block.content.columns || [{ content: 'Column 1' }, { content: 'Column 2' }]).map(
              (col: any, i: number) => (
                <div
                  key={i}
                  className="p-4 bg-slate-50 rounded border border-dashed border-slate-200 min-h-[100px]"
                >
                  <p className="text-sm text-slate-600">{col.content}</p>
                </div>
              )
            )}
          </div>
        );

      case 'list':
        const ListTag = block.content.style === 'numbered' ? 'ol' : 'ul';
        return (
          <ListTag className={`pl-6 ${block.content.style === 'numbered' ? 'list-decimal' : 'list-disc'}`}>
            {(block.content.items || ['Item 1', 'Item 2', 'Item 3']).map(
              (item: string, i: number) => (
                <li key={i} className="text-base" style={{ color: textColor }}>
                  {item}
                </li>
              )
            )}
          </ListTag>
        );

      case 'social':
        const socialIcons: Record<string, string> = {
          linkedin: '🔗',
          twitter: '🐦',
          facebook: '📘',
          instagram: '📷',
          youtube: '▶️',
        };
        return (
          <div className="flex justify-center gap-4">
            {(block.content.links || []).map((link: any, i: number) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl"
              >
                {socialIcons[link.platform] || '🔗'}
              </div>
            ))}
            {(!block.content.links || block.content.links.length === 0) && (
              <p className="text-sm text-slate-400">Add social media links</p>
            )}
          </div>
        );

      case 'footer':
        return (
          <div className="text-center text-sm text-slate-500 border-t pt-4">
            <p className="font-semibold">{block.content.companyName || 'Your Company'}</p>
            <p>{block.content.address || '123 Business St, City, State 12345'}</p>
            {block.content.includeUnsubscribe && (
              <p className="mt-2 text-xs">
                <span className="underline cursor-pointer" style={{ color: linkColor }}>
                  Unsubscribe
                </span>
                {' | '}
                <span className="underline cursor-pointer" style={{ color: linkColor }}>
                  Manage Preferences
                </span>
              </p>
            )}
          </div>
        );

      default:
        return (
          <div className="p-4 bg-slate-50 rounded text-sm text-slate-500">
            Unknown block type: {block.type}
          </div>
        );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative mb-2 rounded-lg border-2 transition-all ${
        isSelected
          ? 'border-blue-500 shadow-md'
          : 'border-transparent hover:border-slate-200'
      } ${!block.isVisible ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      {/* Block Actions (visible on hover/select) */}
      <div
        className={`absolute -left-10 top-0 h-full flex flex-col items-center justify-start gap-1 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {/* Drag Handle */}
        <button
          className="p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4 text-slate-400" />
        </button>

        {/* Move Up */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          className="p-1 rounded hover:bg-slate-100"
        >
          <ChevronUp className="w-4 h-4 text-slate-400" />
        </button>

        {/* Move Down */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          className="p-1 rounded hover:bg-slate-100"
        >
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* More Actions (top right) */}
      <div
        className={`absolute -right-2 -top-2 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full bg-white shadow">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Block Content */}
      <div className="p-4">{renderContent()}</div>

      {/* Block Type Label (on hover) */}
      <div
        className={`absolute -left-10 bottom-0 text-[10px] uppercase tracking-wider text-slate-400 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {block.type}
      </div>
    </div>
  );
}

export default SortableBlock;
