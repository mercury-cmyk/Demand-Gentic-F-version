import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, Target, AlertTriangle, MessageSquare, ArrowRight } from "lucide-react";

export function ReasoningEngineView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Reasoning Engine (Meaning + Strategy)</h3>
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          Gemini Pro Analysis
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              ICP & Buyer Roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Primary Persona</span>
                <Badge>VP of Engineering</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Focused on developer velocity and infrastructure costs.
              </p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm font-medium">Secondary Persona</span>
                <Badge variant="secondary">CTO</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Concerned with security compliance and vendor consolidation.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Top Pain Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 items-start">
                <span className="text-orange-500">•</span>
                <span>Rising cloud infrastructure costs due to inefficient scaling.</span>
              </li>
              <li className="flex gap-2 items-start">
                <span className="text-orange-500">•</span>
                <span>Security bottlenecks slowing down release cycles.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Strategic Angle: "The Efficiency Play"
          </CardTitle>
          <CardDescription>
            Why this account is a good fit right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            They recently raised Series C funding and are hiring aggressively for DevOps roles. 
            This indicates a scaling phase where efficiency bottlenecks will become critical. 
            Position our solution as the "guardrails for growth".
          </p>
          
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Recommended Opener
            </h4>
            <div className="p-3 bg-background rounded-md border text-sm italic">
              "I noticed you're scaling the DevOps team after the recent funding. 
              Usually, at this stage, cloud costs start to outpace headcount..."
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="email" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email">Email Angle</TabsTrigger>
          <TabsTrigger value="call">Call Script</TabsTrigger>
          <TabsTrigger value="objections">Objections</TabsTrigger>
        </TabsList>
        <TabsContent value="email" className="p-4 border rounded-md mt-2">
          <h4 className="font-medium mb-2">Subject: Scaling pains vs. headcount</h4>
          <p className="text-sm text-muted-foreground">
            Hi [Name], saw the open roles for DevOps engineers. Typically teams of your size struggle with...
          </p>
        </TabsContent>
        <TabsContent value="call" className="p-4 border rounded-md mt-2">
          <h4 className="font-medium mb-2">Gatekeeper Safe Opener</h4>
          <p className="text-sm text-muted-foreground">
            "I'm calling regarding the infrastructure scaling initiative mentioned in the recent press release..."
          </p>
        </TabsContent>
        <TabsContent value="objections" className="p-4 border rounded-md mt-2">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">"We built this in-house"</span>
              <span className="text-xs text-muted-foreground">Counter: Maintenance cost focus</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">"Not a priority right now"</span>
              <span className="text-xs text-muted-foreground">Counter: Risk of technical debt</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
