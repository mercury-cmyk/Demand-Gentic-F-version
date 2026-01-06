
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Bot, 
  Send, 
  Loader2, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Play, 
  Pause, 
  Square,
  Terminal
} from "lucide-react";
import { useAgentRun, useCreateRun, useAgentSSE } from "@/hooks/use-agent-command";
import { AgentState } from "@/components/ui/agent-state";
import { cn } from "@/lib/utils";

export default function AgentCommandCenter() {
  const [input, setInput] = useState("");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const createRun = useCreateRun();
  const { run, steps, artifacts, isLoading, connected } = useAgentRun(currentRunId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      const result = await createRun.mutateAsync({
        request: input,
        mode: "auto", // or "interactive"
      });
      setCurrentRunId(result.runId);
      setInput("");
    } catch (error) {
      console.error("Failed to start run:", error);
    }
  };

  // Auto-scroll to bottom of steps
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  return (
    <div className="container mx-auto p-6 h-[calc(100vh-4rem)] flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            Agent Command Center
          </h1>
          <p className="text-muted-foreground">
            Autonomous CRM Operator - Give commands and watch them execute
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "default" : "outline"}>
            {connected ? "Connected" : "Disconnected"}
          </Badge>
          {run && (
            <Badge variant={run.status === "running" ? "secondary" : "outline"}>
              {run.status}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Main Execution Panel */}
        <Card className="lg:col-span-2 flex flex-col h-full">
          <CardHeader>
            <CardTitle>Execution Log</CardTitle>
            <CardDescription>Real-time agent activity and reasoning</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 gap-4">
            <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
              <div className="space-y-6">
                {/* Initial Request */}
                {run && (
                  <div className="flex gap-4">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Terminal className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">User Request</p>
                      <p className="text-base">{run.requestText}</p>
                    </div>
                  </div>
                )}

                {/* Steps */}
                {steps.map((step) => (
                  <div key={step.id} className="flex gap-4 group">
                    <div className="mt-1">
                      {step.status === "running" ? (
                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                      ) : step.status === "done" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : step.status === "failed" ? (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className={cn(
                          "font-medium",
                          step.status === "queued" && "text-muted-foreground"
                        )}>
                          {step.title}
                        </h3>
                        <span className="text-xs text-muted-foreground capitalize">
                          {step.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{step.why}</p>
                      
                      {/* Tool Execution Details */}
                      {step.toolName && step.status !== "queued" && (
                        <div className="bg-muted/50 rounded-md p-3 text-xs font-mono mt-2">
                          <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                            <Terminal className="h-3 w-3" />
                            <span>Tool: {step.toolName}</span>
                          </div>
                          {step.resultSummary && (
                            <div className="text-green-600 dark:text-green-400 mt-1">
                              {">"} {step.resultSummary}
                            </div>
                          )}
                          {step.errorMessage && (
                            <div className="text-red-600 dark:text-red-400 mt-1">
                              {">"} Error: {step.errorMessage}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {steps.length === 0 && !run && (
                  <div className="text-center text-muted-foreground py-12">
                    Ready to execute commands. Try "Analyze my campaigns" or "Create a segment for healthcare leads".
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="pt-4 border-t">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  placeholder="Describe a task for the agent..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={createRun.isPending || (run?.status === "running")}
                  className="flex-1"
                />
                <Button type="submit" disabled={createRun.isPending || (run?.status === "running")}>
                  {createRun.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-2">Execute</span>
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar: Artifacts & Context */}
        <div className="space-y-6">
          <Card className="h-1/2">
            <CardHeader>
              <CardTitle>Artifacts</CardTitle>
              <CardDescription>Generated outputs</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-full">
                {artifacts.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No artifacts generated yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {artifacts.map((artifact) => (
                      <div key={artifact.id} className="p-3 border rounded-md bg-card hover:bg-accent/50 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {artifact.kind}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(artifact.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{artifact.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="h-1/2">
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Agent health & metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Model</span>
                <Badge variant="secondary">GPT-4o</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tools Available</span>
                <span className="text-sm font-medium">8</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Latency</span>
                <span className="text-sm font-medium text-green-500">45ms</span>
              </div>
              <Separator />
              <div className="space-y-2">
                <span className="text-sm font-medium">Active Capabilities</span>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">CRM Query</Badge>
                  <Badge variant="outline">Analytics</Badge>
                  <Badge variant="outline">Campaign Ops</Badge>
                  <Badge variant="outline">Data Analysis</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
