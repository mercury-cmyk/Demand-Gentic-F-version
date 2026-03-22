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
    
      
        {label || "AI Confidence"}
        
          {score}% ({level})
        
      
      {showBar && (
        
          
        
      )}
    
  )
}