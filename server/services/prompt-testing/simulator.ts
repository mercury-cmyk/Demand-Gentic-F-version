import { TestUnit, ConversationLog, ConversationTurn, Scenario, PromptVariant } from "./types";
import { AgentRunner } from "./agent-runner";
import { ProspectAgent } from "./prospect-agent";

export class Simulator {
  private testUnit: TestUnit;
  private scenario: Scenario;
  private prompt: PromptVariant;

  constructor(testUnit: TestUnit, scenario: Scenario, prompt: PromptVariant) {
    this.testUnit = testUnit;
    this.scenario = scenario;
    this.prompt = prompt;
  }

  async run(maxTurns = 20): Promise<ConversationLog> {
    const agentRunner = new AgentRunner(this.prompt, this.testUnit.provider);
    const prospectAgent = new ProspectAgent(this.scenario);
    
    // Initial turn: Prospect answers the phone
    // Or we can simulate ring ring. Let's assume Prospect answers.
    const initialTurn: ConversationTurn = {
      role: "prospect",
      content: "Hello?",
      timestamp: Date.now()
    };
    
    const history: ConversationTurn[] = [initialTurn];
    
    console.log(`Starting simulation: ${this.testUnit.id}`);
    console.log(`Prospect: ${initialTurn.content}`);

    for (let i = 0; i < maxTurns; i++) {
        // Agent turn
        const agentResponse = await agentRunner.generateResponse(history);
        const agentTurn: ConversationTurn = {
            role: "agent",
            content: agentResponse,
            timestamp: Date.now()
        };
        history.push(agentTurn);
        console.log(`Agent: ${agentResponse}`);

        if (this.isConversationOver(agentResponse)) {
            break;
        }

        // Prospect turn
        const prospectResponse = await prospectAgent.generateResponse(history);
        const prospectTurn: ConversationTurn = {
            role: "prospect",
            content: prospectResponse,
            timestamp: Date.now()
        };
        history.push(prospectTurn);
        console.log(`Prospect: ${prospectResponse}`);

        if (this.isConversationOver(prospectResponse)) {
            break;
        }
    }

    return {
        testUnitId: this.testUnit.id,
        turns: history,
        durationMs: history[history.length - 1].timestamp - history[0].timestamp
    };
  }

  private isConversationOver(text: string): boolean {
      const lower = text.toLowerCase();
      // Simple heuristic for now
      if (lower.includes("bye") || lower.includes("have a good day") || lower.includes("hang up")) {
          // Verify if it's a definitive end?
          // For now, let's keep it simple.
          return false; // Let's run a bit longer unless explicit termination marker
      }
      return false; 
  }
}
