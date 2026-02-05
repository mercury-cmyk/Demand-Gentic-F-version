import { useEffect } from "react";
import { Bot, Keyboard } from "lucide-react";
import { useAgentPanelContextOptional } from "@/components/agent-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AgenticCRMOperatorPage() {
  const agentPanel = useAgentPanelContextOptional();

  useEffect(() => {
    agentPanel?.openPanel();
  }, [agentPanel]);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AgentX
          </CardTitle>
          <CardDescription>
            One agent. One place. One way of operating - in the fixed right-side panel across the CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Use the AgentX panel to submit tasks, review proposed plans, and approve execution.</p>
            <p className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Toggle anytime with <span className="font-medium text-foreground">Ctrl+/</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => agentPanel?.openPanel()} disabled={!agentPanel}>
              Open AgentX
            </Button>
            <Button
              variant="outline"
              onClick={() => agentPanel?.toggleCollapse()}
              disabled={!agentPanel || !agentPanel.state.isOpen}
            >
              Collapse panel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
