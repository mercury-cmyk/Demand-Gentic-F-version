import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2, CheckCircle2, AlertCircle, Clock, PlayCircle, PauseCircle } from "lucide-react"

export type AgentStatus = "idle" | "thinking" | "acting" | "waiting" | "completed" | "attention"

interface AgentStateProps {
  status: AgentStatus
  message?: string
  className?: string
}

const statusConfig: Record = {
  idle: { icon: PauseCircle, color: "text-muted-foreground", label: "Idle" },
  thinking: { icon: Loader2, color: "text-primary", label: "Thinking...", animate: true },
  acting: { icon: PlayCircle, color: "text-primary", label: "Acting" },
  waiting: { icon: Clock, color: "text-warning", label: "Waiting" },
  completed: { icon: CheckCircle2, color: "text-success", label: "Completed" },
  attention: { icon: AlertCircle, color: "text-destructive", label: "Needs Attention" },
}

export function AgentState({ status, message, className }: AgentStateProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    
      
        
        {status === "acting" && (
          
        )}
      
      
        {message || config.label}
      
    
  )
}