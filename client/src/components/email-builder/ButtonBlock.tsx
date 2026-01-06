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
  onChange: (updates: Partial<ButtonBlockProps>) => void;
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
      <div style="${alignmentStyle} margin: 16px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;${widthStyle}" arcsize="15%" strokecolor="${backgroundColor}" fillcolor="${backgroundColor}">
          <w:anchorlock/>
          <center style="color:${textColor};font-family:sans-serif;font-size:16px;font-weight:bold;">${text}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${url}" 
           style="display:inline-block; 
                  padding: 14px 28px; 
                  background: ${backgroundColor}; 
                  color: ${textColor}; 
                  border-radius: ${borderRadius}; 
                  font-weight: 600; 
                  text-decoration: none; 
                  font-size: 16px;
                  ${widthStyle}
                  mso-hide: all;">
          ${text}
        </a>
        <!--<![endif]-->
      </div>
    `;
  };

  return (
    <div 
      className="group relative border border-dashed border-transparent hover:border-blue-300 rounded-lg p-2 transition-colors"
      data-block-id={id}
      data-block-type="button"
      data-block-html={generateHtml()}
    >
      {/* Toolbar */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 bg-white shadow-lg rounded-lg px-2 py-1 border z-10">
        <button className="p-1 hover:bg-slate-100 rounded cursor-move">
          <GripVertical className="w-4 h-4 text-slate-400" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 hover:bg-slate-100 rounded">
              <Settings className="w-4 h-4 text-slate-600" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="center">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Button Text</Label>
                <Input
                  value={localText}
                  onChange={(e) => setLocalText(e.target.value)}
                  placeholder="Button text..."
                />
              </div>
              
              <div className="space-y-2">
                <Label>Button URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1"
                  />
                  <Button size="icon" variant="outline" asChild>
                    <a href={localUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use merge tags like {"{{campaign.landing_page}}"} for dynamic URLs
                </p>
              </div>

              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      className={`w-6 h-6 rounded-full border-2 ${
                        backgroundColor === color.value ? 'border-slate-900' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => onChange({ backgroundColor: color.value })}
                      title={color.name}
                    />
                  ))}
                  <Input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => onChange({ backgroundColor: e.target.value })}
                    className="w-6 h-6 p-0 border-0 cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Alignment</Label>
                <Select value={alignment} onValueChange={(v) => onChange({ alignment: v as any })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Border Radius</Label>
                <Select value={borderRadius} onValueChange={(v) => onChange({ borderRadius: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Square</SelectItem>
                    <SelectItem value="4px">Slight</SelectItem>
                    <SelectItem value="8px">Rounded</SelectItem>
                    <SelectItem value="12px">More Rounded</SelectItem>
                    <SelectItem value="9999px">Pill</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSave} className="w-full">
                Save Changes
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <button 
          className="p-1 hover:bg-slate-100 rounded"
          onClick={onDuplicate}
        >
          <Copy className="w-4 h-4 text-slate-600" />
        </button>
        <button 
          className="p-1 hover:bg-red-100 rounded"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>

      {/* Preview */}
      <div style={{ textAlign: alignment }}>
        <button
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            background: backgroundColor,
            color: textColor,
            borderRadius: borderRadius,
            fontWeight: 600,
            fontSize: '16px',
            border: 'none',
            cursor: 'pointer',
            width: fullWidth ? '100%' : 'auto',
          }}
          onClick={() => setIsEditing(true)}
        >
          {text}
        </button>
      </div>

      {/* Click to edit URL hint */}
      <div className="hidden group-hover:block text-xs text-center text-muted-foreground mt-2">
        Click settings to edit button URL
      </div>
    </div>
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
<div style="${alignmentStyle} margin: 16px 0;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${finalUrl}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="15%" strokecolor="${backgroundColor}" fillcolor="${backgroundColor}">
    <w:anchorlock/>
    <center style="color:${textColor};font-family:sans-serif;font-size:16px;font-weight:bold;">${text}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <a href="${finalUrl}" 
     style="display:inline-block; 
            padding: 14px 28px; 
            background: ${backgroundColor}; 
            color: ${textColor}; 
            border-radius: ${borderRadius}; 
            font-weight: 600; 
            text-decoration: none; 
            font-size: 16px;
            mso-hide: all;">
    ${text}
  </a>
  <!--<![endif]-->
</div>`;
}
