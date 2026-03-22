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
    
      {/* Toolbar */}
      
        
          HTML Editor
        
        
          
            
            Format
          
          {onPreview && (
            
              
              Preview
            
          )}
        
      

      {/* Monaco Editor */}
      
        
      

      {/* Helper Text */}
      
        
          Tip: Use personalization tokens like{" "}
          {"{{contact.first_name}}"},{" "}
          {"{{contact.company}}"}, and{" "}
          {"{{account.name}}"} to personalize your emails.
          Press Shift+Alt+F to format code.
        
      
    
  );
}