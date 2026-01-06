import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2, CheckCircle2, AlertCircle, Clock, PlayCircle, PauseCircle } from "lucide-react"

export type AgentStatus = "idle" | "thinking" | "acting" | "waiting" | "completed" | "attention"

interface AgentStateProps {
  status: AgentStatus
  message?: string
  className?: string
}

const statusConfig: Record<AgentStatus, { icon: React.ElementType, color: string, label: string, animate?: boolean }> = {
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
    <div className={cn("inline-flex items-center gap-2 rounded-full border border-transparent bg-muted/60 px-2.5 py-1 text-xs font-medium transition-colors", className)}>
      <div className={cn("relative flex items-center justify-center", config.color)}>
        <Icon className={cn("h-4 w-4", config.animate && "animate-spin")} />
        {status === "acting" && (
          <span className="absolute inset-0 animate-ping opacity-20 rounded-full bg-primary" />
        )}
      </div>
      <span className={cn("font-medium", config.color)}>
        {message || config.label}
      </span>
    </div>
  )
}
