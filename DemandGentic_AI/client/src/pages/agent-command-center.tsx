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
  const [currentRunId, setCurrentRunId] = useState(null);
  const scrollRef = useRef(null);

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
    
      
        
          
            
            Agent Command Center
          
          
            Autonomous CRM Operator - Give commands and watch them execute
          
        
        
          
            {connected ? "Connected" : "Disconnected"}
          
          {run && (
            
              {run.status}
            
          )}
        
      

      
        {/* Main Execution Panel */}
        
          
            Execution Log
            Real-time agent activity and reasoning
          
          
            
              
                {/* Initial Request */}
                {run && (
                  
                    
                      
                    
                    
                      User Request
                      {run.requestText}
                    
                  
                )}

                {/* Steps */}
                {steps.map((step) => (
                  
                    
                      {step.status === "running" ? (
                        
                      ) : step.status === "done" ? (
                        
                      ) : step.status === "failed" ? (
                        
                      ) : (
                        
                      )}
                    
                    
                      
                        
                          {step.title}
                        
                        
                          {step.status}
                        
                      
                      {step.why}
                      
                      {/* Tool Execution Details */}
                      {step.toolName && step.status !== "queued" && (
                        
                          
                            
                            Tool: {step.toolName}
                          
                          {step.resultSummary && (
                            
                              {">"} {step.resultSummary}
                            
                          )}
                          {step.errorMessage && (
                            
                              {">"} Error: {step.errorMessage}
                            
                          )}
                        
                      )}
                    
                  
                ))}

                {steps.length === 0 && !run && (
                  
                    Ready to execute commands. Try "Analyze my campaigns" or "Create a segment for healthcare leads".
                  
                )}
              
            

            {/* Input Area */}
            
              
                 setInput(e.target.value)}
                  disabled={createRun.isPending || (run?.status === "running")}
                  className="flex-1"
                />
                
                  {createRun.isPending ? (
                    
                  ) : (
                    
                  )}
                  Execute
                
              
            
          
        

        {/* Sidebar: Artifacts & Context */}
        
          
            
              Artifacts
              Generated outputs
            
            
              
                {artifacts.length === 0 ? (
                  
                    No artifacts generated yet.
                  
                ) : (
                  
                    {artifacts.map((artifact) => (
                      
                        
                          
                            {artifact.kind}
                          
                          
                            {new Date(artifact.createdAt).toLocaleTimeString()}
                          
                        
                        {artifact.title}
                      
                    ))}
                  
                )}
              
            
          

          
            
              System Status
              Agent health & metrics
            
            
              
                Model
                GPT-4o
              
              
                Tools Available
                8
              
              
                Latency
                45ms
              
              
              
                Active Capabilities
                
                  CRM Query
                  Analytics
                  Campaign Ops
                  Data Analysis
                
              
            
          
        
      
    
  );
}