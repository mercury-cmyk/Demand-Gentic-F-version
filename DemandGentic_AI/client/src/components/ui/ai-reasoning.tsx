import * as React from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface AIReasoningProps {
  summary: string
  details?: React.ReactNode
  type?: "inference" | "rule" | "instruction"
  className?: string
}

export function AIReasoning({ summary, details, type = "inference", className }: AIReasoningProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    
      
        
          
          {summary}
          {details && (
            
              Why?
            
          )}
        
      
      {details && (
        
          
            
              {details}
            
          
        
      )}
    
  )
}