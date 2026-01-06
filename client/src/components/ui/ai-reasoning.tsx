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
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("text-xs", className)}
    >
      <CollapsibleTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-full border border-transparent bg-muted/60 px-2.5 py-1 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors group text-left">
          <Sparkles className={cn("h-3.5 w-3.5 shrink-0", type === "inference" ? "text-primary" : "text-muted-foreground")} />
          <span className="font-medium">{summary}</span>
          {details && (
            <span className="text-[11px] text-primary opacity-70 group-hover:opacity-100 transition-opacity underline decoration-dotted underline-offset-2 ml-1 whitespace-nowrap">
              Why?
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      {details && (
        <CollapsibleContent className="mt-2 overflow-hidden">
          <div className="rounded-lg border border-border/60 bg-card/80 p-3 text-xs shadow-xs backdrop-blur animate-in slide-in-from-top-1 fade-in duration-200">
            <div className="text-muted-foreground leading-relaxed">
              {details}
            </div>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
