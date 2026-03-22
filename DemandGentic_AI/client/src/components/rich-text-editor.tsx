import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Link as LinkIcon, Undo, Redo, Heading1, Heading2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ content, onChange, placeholder = "Write your message here...", className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2]
        },
        // Disable extensions that are already added manually to avoid duplicates
        link: false,
        underline: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        // Make the editor height-flexible so parents can control it (e.g. full-height panes).
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  }, []);

  // Sync editor content when the content prop changes (e.g., after AI rewrite)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    
      {/* Toolbar */}
      
         editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('heading', { level: 1 }) && 'bg-muted'
          )}
          data-testid="button-format-h1"
        >
          
        
         editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('heading', { level: 2 }) && 'bg-muted'
          )}
          data-testid="button-format-h2"
        >
          
        

        

         editor.chain().focus().toggleBold().run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('bold') && 'bg-muted'
          )}
          data-testid="button-format-bold"
        >
          
        
         editor.chain().focus().toggleItalic().run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('italic') && 'bg-muted'
          )}
          data-testid="button-format-italic"
        >
          
        
         editor.chain().focus().toggleUnderline().run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('underline') && 'bg-muted'
          )}
          data-testid="button-format-underline"
        >
          
        

        

         editor.chain().focus().toggleBulletList().run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('bulletList') && 'bg-muted'
          )}
          data-testid="button-format-bullet-list"
        >
          
        
         editor.chain().focus().toggleOrderedList().run()}
          className={cn(
            "h-8 px-2",
            editor.isActive('orderedList') && 'bg-muted'
          )}
          data-testid="button-format-ordered-list"
        >
          
        

        

        
          
        

        

         editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-8 px-2"
          data-testid="button-format-undo"
        >
          
        
         editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-8 px-2"
          data-testid="button-format-redo"
        >
          
        
      

      {/* Editor Content */}
      
        
      
    
  );
}