import * as React from "react"
import { cn } from "@/lib/utils"

interface ConfidenceIndicatorProps {
  score: number // 0 to 100
  label?: string
  className?: string
  showBar?: boolean
}

export function ConfidenceIndicator({ score, label, className, showBar = true }: ConfidenceIndicatorProps) {
  let colorClass = "bg-destructive"
  let textClass = "text-destructive"
  let level = "Low Confidence"

  if (score >= 80) {
    colorClass = "bg-success"
    textClass = "text-success"
    level = "High Confidence"
  } else if (score >= 50) {
    colorClass = "bg-warning"
    textClass = "text-warning"
    level = "Medium Confidence"
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-muted-foreground">{label || "AI Confidence"}</span>
        <span className={cn("font-semibold", textClass)}>
          {score}% ({level})
        </span>
      </div>
      {showBar && (
        <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500 ease-out rounded-full", colorClass)} 
            style={{ width: `${score}%` }}
          />
        </div>
      )}
    </div>
  )
}
