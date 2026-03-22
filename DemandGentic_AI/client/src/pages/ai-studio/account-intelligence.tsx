import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Sparkles, Globe, Database, Workflow } from "lucide-react";
import { PipelineStatus } from "@/components/ai-studio/account-intelligence/pipeline-status";
import { ResearchEngineView } from "@/components/ai-studio/account-intelligence/research-engine-view";
import { ReasoningEngineView } from "@/components/ai-studio/account-intelligence/reasoning-engine-view";
import { IntelligenceGatherPanel } from "@/components/ai-studio/account-intelligence/intelligence-gather-panel";
import { OiBatchPipelineTab } from "@/components/ai-studio/account-intelligence/oi-batch-pipeline-tab";

export default function AccountIntelligencePage() {
  const [analyzing, setAnalyzing] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [domain, setDomain] = useState("");

  const handleAnalyze = () => {
    if (!domain) return;
    setAnalyzing(true);
    setResultsVisible(false);

    setTimeout(() => {
      setAnalyzing(false);
      setResultsVisible(true);
    }, 2000);
  };

  const pipelineSteps = [
    { id: "1", label: "Entity Resolution", status: resultsVisible ? "completed" : analyzing ? "completed" : "pending", description: "Identified: Acme Corp (acme.com)" },
    { id: "2", label: "Source Collection", status: resultsVisible ? "completed" : analyzing ? "processing" : "pending", description: "Scanning website, LinkedIn, News" },
    { id: "3", label: "Fact Extraction", status: resultsVisible ? "completed" : "pending", description: "Structuring data into schema" },
    { id: "4", label: "Reasoning Synthesis", status: resultsVisible ? "completed" : "pending", description: "Generating strategic angles" },
    { id: "5", label: "Quality Gate", status: resultsVisible ? "completed" : "pending", description: "Verifying claims & compliance" },
  ];

  return (
    
      
        
          Account Intelligence
          
            Turn target accounts into actionable messaging angles using deep research and reasoning.
          
        
      

      
        
          
            
            Analysis Pipeline
          
          
            
            Batch Intelligence
          
          
            
            Single Account
          
        

        {/* Analysis Pipeline Tab */}
        
          
        

        {/* Batch Intelligence Tab */}
        
          
        

        {/* Single Account Tab (existing domain analysis) */}
        
          
            
              
                
                  
                    Target Account Domain
                  
                  
                    
                     setDomain(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    />
                  
                
                
                  {analyzing ? (
                    <>Analyzing...
                  ) : (
                    <>
                      
                      Analyze Account
                    
                  )}
                
              
            
          

          {(analyzing || resultsVisible) && (
            
              
                
                  Analysis Pipeline
                
                
                  
                
              

              
                {resultsVisible ? (
                  
                    
                      
                        
                      
                    
                    
                      
                        
                      
                    
                  
                ) : (
                  
                    
                      
                      
                    
                    Gathering Intelligence...
                    
                      Our agents are scanning public sources, verifying facts, and synthesizing a strategy for {domain}.
                    
                  
                )}
              
            
          )}
        
      
    
  );
}