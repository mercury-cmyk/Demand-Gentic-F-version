import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Settings, Trash2, Copy, GripVertical } from "lucide-react";

interface ButtonBlockProps {
  id: string;
  text: string;
  url: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
  alignment?: 'left' | 'center' | 'right';
  fullWidth?: boolean;
  onChange: (updates: Partial) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const PRESET_COLORS = [
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Slate', value: '#475569' },
  { name: 'Black', value: '#0f172a' },
];

export function ButtonBlock({
  id,
  text = "Click Here",
  url = "https://example.com",
  backgroundColor = "#4f46e5",
  textColor = "#ffffff",
  borderRadius = "8px",
  alignment = "center",
  fullWidth = false,
  onChange,
  onDelete,
  onDuplicate,
}: ButtonBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(text);
  const [localUrl, setLocalUrl] = useState(url);

  const handleSave = () => {
    // Ensure URL has protocol
    let finalUrl = localUrl;
    if (localUrl && !localUrl.startsWith('http') && !localUrl.startsWith('{{')) {
      finalUrl = 'https://' + localUrl;
    }
    onChange({ text: localText, url: finalUrl });
    setIsEditing(false);
  };

  const generateHtml = () => {
    const alignmentStyle = {
      left: 'text-align: left;',
      center: 'text-align: center;',
      right: 'text-align: right;',
    }[alignment];

    const widthStyle = fullWidth ? 'width: 100%;' : '';

    return `
      
        
        
          
          ${text}
        
        
        
        
          ${text}
        
        
      
    `;
  };

  return (
    
      {/* Toolbar */}
      
        
          
        
        
          
            
              
            
          
          
            
              
                Button Text
                 setLocalText(e.target.value)}
                  placeholder="Button text..."
                />
              
              
              
                Button URL
                
                   setLocalUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1"
                  />
                  
                    
                      
                    
                  
                
                
                  Use merge tags like {"{{campaign.landing_page}}"} for dynamic URLs
                
              

              
                Background Color
                
                  {PRESET_COLORS.map((color) => (
                     onChange({ backgroundColor: color.value })}
                      title={color.name}
                    />
                  ))}
                   onChange({ backgroundColor: e.target.value })}
                    className="w-6 h-6 p-0 border-0 cursor-pointer"
                  />
                
              

              
                Alignment
                 onChange({ alignment: v as any })}>
                  
                    
                  
                  
                    Left
                    Center
                    Right
                  
                
              

              
                Border Radius
                 onChange({ borderRadius: v })}>
                  
                    
                  
                  
                    Square
                    Slight
                    Rounded
                    More Rounded
                    Pill
                  
                
              

              
                Save Changes
              
            
          
        
        
          
        
        
          
        
      

      {/* Preview */}
      
         setIsEditing(true)}
        >
          {text}
        
      

      {/* Click to edit URL hint */}
      
        Click settings to edit button URL
      
    
  );
}

// Export a utility to create button HTML for email
export function createButtonHtml(options: {
  text: string;
  url: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
  alignment?: 'left' | 'center' | 'right';
}): string {
  const {
    text,
    url,
    backgroundColor = '#4f46e5',
    textColor = '#ffffff',
    borderRadius = '8px',
    alignment = 'center',
  } = options;

  // Ensure URL has protocol
  let finalUrl = url;
  if (url && !url.startsWith('http') && !url.startsWith('{{')) {
    finalUrl = 'https://' + url;
  }

  const alignmentStyle = {
    left: 'text-align: left;',
    center: 'text-align: center;',
    right: 'text-align: right;',
  }[alignment];

  return `

  
  
    
    ${text}
  
  
  
  
    ${text}
  
  
`;
}