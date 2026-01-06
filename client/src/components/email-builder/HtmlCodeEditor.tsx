import { Editor } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Eye, Wand2 } from "lucide-react";

interface HtmlCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPreview?: () => void;
  height?: string;
}

export function HtmlCodeEditor({
  value,
  onChange,
  onPreview,
  height = "600px"
}: HtmlCodeEditorProps) {
  const handleEditorChange = (value: string | undefined) => {
    onChange(value || "");
  };

  const formatCode = () => {
    // Monaco has built-in formatting via the editor instance
    // This will be triggered via editor.getAction('editor.action.formatDocument').run()
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">HTML Editor</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={formatCode}
            title="Format Code (Shift+Alt+F)"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Format
          </Button>
          {onPreview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPreview}
              title="Preview Email"
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height={height}
          defaultLanguage="html"
          value={value}
          onChange={handleEditorChange}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            wordWrap: "on",
            formatOnPaste: true,
            formatOnType: true,
            autoIndent: "full",
            tabSize: 2,
            suggestOnTriggerCharacters: true,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true
            },
            scrollBeyondLastLine: false,
            folding: true,
            bracketPairColorization: {
              enabled: true
            }
          }}
        />
      </div>

      {/* Helper Text */}
      <div className="p-3 border-t bg-muted/20 text-xs text-muted-foreground">
        <p>
          <strong>Tip:</strong> Use personalization tokens like{" "}
          <code className="px-1 py-0.5 bg-muted rounded">{"{{contact.first_name}}"}</code>,{" "}
          <code className="px-1 py-0.5 bg-muted rounded">{"{{contact.company}}"}</code>, and{" "}
          <code className="px-1 py-0.5 bg-muted rounded">{"{{account.name}}"}</code> to personalize your emails.
          Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Shift+Alt+F</kbd> to format code.
        </p>
      </div>
    </div>
  );
}
