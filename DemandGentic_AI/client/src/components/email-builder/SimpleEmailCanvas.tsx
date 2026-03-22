import {
  Mail,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link,
  Unlink,
  Type,
  ChevronDown,
  User,
  Building2,
  AtSign,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SimpleEmailCanvasProps {
  initialHtml?: string;
  onChange?: (html: string) => void;
}

// Merge field definitions
const mergeFields = [
  {
    category: "Contact",
    icon: User,
    fields: [
      { label: "First Name", token: "{{contact.first_name}}" },
      { label: "Last Name", token: "{{contact.last_name}}" },
      { label: "Full Name", token: "{{contact.full_name}}" },
      { label: "Email", token: "{{contact.email}}" },
      { label: "Job Title", token: "{{contact.job_title}}" },
      { label: "Phone", token: "{{contact.phone}}" },
      { label: "LinkedIn", token: "{{contact.linkedin_url}}" },
    ],
  },
  {
    category: "Account",
    icon: Building2,
    fields: [
      { label: "Company Name", token: "{{account.name}}" },
      { label: "Website", token: "{{account.website}}" },
      { label: "Industry", token: "{{account.industry}}" },
      { label: "City", token: "{{account.city}}" },
      { label: "State", token: "{{account.state}}" },
      { label: "Country", token: "{{account.country}}" },
      { label: "Employee Count", token: "{{account.employee_count}}" },
    ],
  },
  {
    category: "Campaign",
    icon: Calendar,
    fields: [
      { label: "Campaign Name", token: "{{campaign.name}}" },
      { label: "Sender Name", token: "{{sender.name}}" },
      { label: "Sender Email", token: "{{sender.email}}" },
      { label: "Unsubscribe Link", token: "{{unsubscribe_url}}" },
      { label: "View in Browser", token: "{{view_in_browser_url}}" },
    ],
  },
];

export function SimpleEmailCanvas({
  initialHtml = "",
  onChange,
}: SimpleEmailCanvasProps) {
  const editorRef = useRef(null);
  const isUpdatingRef = useRef(false);
  const [isEditorEmpty, setIsEditorEmpty] = useState(() => !initialHtml?.trim());
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkPopover, setShowLinkPopover] = useState(false);

  // Sync initialHtml to editor when it changes externally
  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      if (editorRef.current.innerHTML !== initialHtml) {
        editorRef.current.innerHTML = initialHtml || '';
      }
    }
    setIsEditorEmpty(!initialHtml?.trim());
  }, [initialHtml]);

  // Handle content edits
  const handleInput = () => {
    if (editorRef.current) {
      isUpdatingRef.current = true;
      const nextHtml = editorRef.current.innerHTML;
      setIsEditorEmpty(!editorRef.current.textContent?.trim() && !nextHtml.trim());
      onChange?.(nextHtml);
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  };

  // Execute formatting command
  const execCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  };

  // Insert text at cursor position
  const insertAtCursor = (text: string) => {
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      document.execCommand("insertText", false, text);
    }
    handleInput();
  };

  // Insert link
  const insertLink = () => {
    if (linkUrl) {
      execCommand("createLink", linkUrl);
      setLinkUrl("");
      setShowLinkPopover(false);
    }
  };

  // Remove link
  const removeLink = () => {
    execCommand("unlink");
  };

  // Toolbar button component
  const ToolbarButton = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    
      {children}
    
  );

  return (
    
      {/* Rich Text Toolbar */}
      
        {/* Text Formatting */}
        
           execCommand("bold")} title="Bold (Ctrl+B)">
            
          
           execCommand("italic")} title="Italic (Ctrl+I)">
            
          
           execCommand("underline")} title="Underline (Ctrl+U)">
            
          
           execCommand("strikeThrough")} title="Strikethrough">
            
          
        

        {/* Font Size */}
        
          
            
              
                
                Size
                
              
            
            
               execCommand("fontSize", "1")}>
                Small
              
               execCommand("fontSize", "3")}>
                Normal
              
               execCommand("fontSize", "5")}>
                Large
              
               execCommand("fontSize", "7")}>
                Extra Large
              
            
          
        

        {/* Alignment */}
        
           execCommand("justifyLeft")} title="Align Left">
            
          
           execCommand("justifyCenter")} title="Align Center">
            
          
           execCommand("justifyRight")} title="Align Right">
            
          
        

        {/* Lists */}
        
           execCommand("insertUnorderedList")} title="Bullet List">
            
          
           execCommand("insertOrderedList")} title="Numbered List">
            
          
        

        {/* Link */}
        
          
            
              
                
              
            
            
              
                Link URL
                 setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  onKeyDown={(e) => e.key === "Enter" && insertLink()}
                />
                
                  Insert Link
                
              
            
          
          
            
          
        

        {/* Merge Fields / Personalization */}
        
          
            
              
              Merge Fields
              
            
          
          
            {mergeFields.map((category, idx) => (
              
                {idx > 0 && }
                
                  
                  {category.category}
                
                {category.fields.map((field) => (
                   insertAtCursor(field.token)}
                    className="text-sm cursor-pointer"
                  >
                    {field.label}
                    
                      {field.token.replace(/\{\{|\}\}/g, "")}
                    
                  
                ))}
              
            ))}
          
        
      

      {/* Canvas Area */}
      
        
          {isEditorEmpty && (
            
              
                
                  
                
                Start building your email
                
                  Click a block on the left or use the toolbar above to add content.
                
              
            
          )}

          
        
      
    
  );
}