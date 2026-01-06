import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import { PipelineStatus } from "@/components/ai-studio/account-intelligence/pipeline-status";
import { ResearchEngineView } from "@/components/ai-studio/account-intelligence/research-engine-view";
import { ReasoningEngineView } from "@/components/ai-studio/account-intelligence/reasoning-engine-view";
import { Separator } from "@/components/ui/separator";

export default function AccountIntelligencePage() {
  const [analyzing, setAnalyzing] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [domain, setDomain] = useState("");

  const handleAnalyze = () => {
    if (!domain) return;
    setAnalyzing(true);
    setResultsVisible(false);
    
    // Simulate pipeline delay
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
    <div className="p-6 space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account Intelligence</h1>
          <p className="text-muted-foreground mt-2">
            Turn target accounts into actionable messaging angles using deep research and reasoning.
          </p>
        </div>
      </div>

      <Card className="shrink-0">
        <CardContent className="p-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Target Account Domain
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="e.g. netflix.com" 
                  className="pl-8" 
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
              </div>
            </div>
            <Button onClick={handleAnalyze} disabled={analyzing || !domain} className="min-w-[140px]">
              {analyzing ? (
                <>Analyzing...</>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Analyze Account
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(analyzing || resultsVisible) && (
        <div className="grid lg:grid-cols-12 gap-6 flex-1 min-h-0">
          {/* Pipeline Status Sidebar */}
          <Card className="lg:col-span-3 h-fit">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Analysis Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <PipelineStatus steps={pipelineSteps as any} />
            </CardContent>
          </Card>

          {/* Main Content Area */}
          <div className="lg:col-span-9 space-y-6 pb-10">
            {resultsVisible ? (
              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="h-fit">
                  <CardContent className="p-6">
                    <ResearchEngineView />
                  </CardContent>
                </Card>
                <Card className="h-fit border-primary/20 shadow-md">
                  <CardContent className="p-6">
                    <ReasoningEngineView />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                  <Sparkles className="h-12 w-12 text-primary relative z-10 animate-bounce" />
                </div>
                <h3 className="text-xl font-semibold">Gathering Intelligence...</h3>
                <p className="text-muted-foreground max-w-md">
                  Our agents are scanning public sources, verifying facts, and synthesizing a strategy for {domain}.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
