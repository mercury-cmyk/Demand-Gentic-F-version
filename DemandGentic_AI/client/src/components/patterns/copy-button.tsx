import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type CopyButtonSize = "xs" | "sm" | "md";

export interface CopyButtonProps {
  value: string;
  size?: CopyButtonSize;
  className?: string;
}

export function CopyButton({ value, size = "sm", className }: CopyButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!value) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed:", error);
      toast({ title: "Copy failed", description: "Unable to copy value." });
    }
  };

  const sizeClasses =
    size === "xs"
      ? "h-6 w-6"
      : size === "md"
      ? "h-8 w-8"
      : "h-7 w-7";

  return (
    
      {copied ?  : }
    
  );
}