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
  const editorRef = useRef<HTMLDivElement>(null);
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
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded hover:bg-slate-200 transition-colors",
        active && "bg-slate-200 text-blue-600"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="piq-email-canvas h-full w-full flex flex-col bg-muted/30">
      {/* Rich Text Toolbar */}
      <div className="sticky top-0 z-20 bg-white border-b px-3 py-2 flex items-center gap-1 flex-wrap">
        {/* Text Formatting */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <ToolbarButton onClick={() => execCommand("bold")} title="Bold (Ctrl+B)">
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand("italic")} title="Italic (Ctrl+I)">
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand("underline")} title="Underline (Ctrl+U)">
            <Underline className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand("strikeThrough")} title="Strikethrough">
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Font Size */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 text-sm">
                <Type className="w-4 h-4" />
                <span className="hidden sm:inline">Size</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => execCommand("fontSize", "1")}>
                <span className="text-xs">Small</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => execCommand("fontSize", "3")}>
                <span className="text-sm">Normal</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => execCommand("fontSize", "5")}>
                <span className="text-lg">Large</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => execCommand("fontSize", "7")}>
                <span className="text-2xl">Extra Large</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Alignment */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <ToolbarButton onClick={() => execCommand("justifyLeft")} title="Align Left">
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand("justifyCenter")} title="Align Center">
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand("justifyRight")} title="Align Right">
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Lists */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <ToolbarButton onClick={() => execCommand("insertUnorderedList")} title="Bullet List">
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand("insertOrderedList")} title="Numbered List">
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Link */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <Popover open={showLinkPopover} onOpenChange={setShowLinkPopover}>
            <PopoverTrigger asChild>
              <button
                className="p-1.5 rounded hover:bg-slate-200 transition-colors"
                title="Insert Link"
              >
                <Link className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-2">
                <label className="text-sm font-medium">Link URL</label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  onKeyDown={(e) => e.key === "Enter" && insertLink()}
                />
                <Button size="sm" onClick={insertLink} className="w-full">
                  Insert Link
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <ToolbarButton onClick={removeLink} title="Remove Link">
            <Unlink className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Merge Fields / Personalization */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
              <User className="w-3.5 h-3.5" />
              <span>Merge Fields</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {mergeFields.map((category, idx) => (
              <div key={category.category}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                  <category.icon className="w-3.5 h-3.5" />
                  {category.category}
                </DropdownMenuLabel>
                {category.fields.map((field) => (
                  <DropdownMenuItem
                    key={field.token}
                    onClick={() => insertAtCursor(field.token)}
                    className="text-sm cursor-pointer"
                  >
                    <span>{field.label}</span>
                    <span className="ml-auto text-xs text-slate-400 font-mono">
                      {field.token.replace(/\{\{|\}\}/g, "")}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="relative mx-auto w-full max-w-[760px] rounded-xl border border-border bg-card shadow-sm">
          {isEditorEmpty && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Mail className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">Start building your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click a block on the left or use the toolbar above to add content.
                </p>
              </div>
            </div>
          )}

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            className="min-h-[600px] w-full p-6 outline-none focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
