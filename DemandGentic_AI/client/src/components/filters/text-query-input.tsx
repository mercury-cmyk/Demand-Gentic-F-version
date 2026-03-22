import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface TextQueryInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TextQueryInput({
  value,
  onChange,
  placeholder = "Enter search text...",
  className
}: TextQueryInputProps) {
  return (
    
      
       onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        data-testid="text-query-input"
      />
    
  );
}