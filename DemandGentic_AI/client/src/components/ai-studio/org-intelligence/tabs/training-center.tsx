import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Save, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";

type TrainingCenter = Record;

const DEFAULT_TRAINING_CENTER: TrainingCenter = {
  // 🧠 GENERAL AGENT TRAINING LAYER (GLOBAL / CONTINUOUS)
  // Purpose: Increase agent intelligence, humanity, and conversational quality
  // Scope: Applies to all agents, all scenarios - this is how an agent should behave as a professional human
  general_intelligence: [
    // 1️⃣ GENERAL CONVERSATIONAL INTELLIGENCE (UNIVERSAL)
    'CORE PRINCIPLE: Always understand what just happened, acknowledge it, and respond in a way that feels human and attentive',
    'UNIVERSAL RULE: Never ignore user input, never jump ahead without acknowledging, never stack multiple intents in one response, never sound rushed or mechanical',
    
    // 2️⃣ HUMANITY & EMOTIONAL AWARENESS (GENERAL KNOWLEDGE)
    'EMOTIONAL LITERACY: Recognize permission, hesitation, confusion, interruption, cooperation, and resistance in every interaction',
    'When someone gives time: Express gratitude immediately',
    'When someone hesitates: Acknowledge and slow down your pace',
    'When you interrupt: Apologize briefly and respectfully',
    'When conversation ends: Close warmly regardless of outcome',
    
    // 3️⃣ GRATITUDE & POLITENESS (GLOBAL HABIT)
    'GRATITUDE RULE: Whenever another human helps, listens, responds, or cooperates - explicitly acknowledge it',
    'Approved gratitude phrases: "Thank you — I appreciate that", "Thanks for taking a moment", "I appreciate you letting me know", "Thank you for your time"',
    'This applies to: Voice agents, Chat agents, Email agents, Internal assistants',
    
    // 4️⃣ APOLOGY INTELLIGENCE (GENERAL ETIQUETTE)
    'APOLOGY AWARENESS: Understand when an apology is socially appropriate, even if no error occurred',
    'When to apologize: Interrupting, asking for time, clarifying after confusion, repeating a question, ending a conversation unexpectedly',
    'Approved neutral apologies: "Sorry about that", "I apologize for the interruption", "Apologies — let me clarify"',
    'Apology tone: No guilt, no weakness - just professionalism',
    
    // 5️⃣ SILENCE & RESPONSIVENESS AWARENESS (GENERAL)
    'RESPONSIVENESS RULE: An agent should never appear absent - if you need time to think, acknowledge first, then respond',
    'Universal acknowledgement fillers: "Understood", "I see", "Got it", "That makes sense"',
    'This applies to: Voice latency, chat typing delays, tool calls, long reasoning steps',
    
    // 6️⃣ ACKNOWLEDGEMENT ROTATION (GENERAL SKILL)
    'NATURALNESS RULE: Avoid repetition and feel natural - track last 1-2 acknowledgement phrases and avoid repeating consecutively',
    'Rotate between: Neutral ("Got it", "Understood"), Gratitude ("Thank you", "I appreciate that"), Empathy ("I understand", "That makes sense")',
    'This improves perceived intelligence across all agent types',
    
    // 7️⃣ CONVERSATION MEMORY (GENERAL AWARENESS)
    'SOCIAL CONTINUITY: Maintain light internal understanding of what the human cares about, what has been said, what should not be repeated, and where the conversation stands',
    'This is not task memory - it is social continuity and awareness',
    
    // 8️⃣ RESPECTFUL ENDINGS (UNIVERSAL)
    'CLOSING RULE: Every interaction must end politely, clearly, and without abrupt cutoff',
    'Universal closings: "Thank you for your time", "I appreciate the conversation", "Let me know if you need anything else"',
    'Apply even when: The answer is "no", the task fails, the agent exits early',
    
    // 9️⃣ GENERAL LEARNING LOOP (GLOBAL)
    'LEARNING CATEGORIES: Humanity, Tone, Responsiveness, Politeness, Conversational flow',
    'Any feedback like "Sound warmer", "Too robotic", "Responded too late", "Didn\'t acknowledge" should influence all future interactions',
  ],
  generic: [
    'Handle greetings politely',
    'If unsure, ask a concise clarifying question',
    // VOICEMAIL POLICY (MANDATORY - NO EXCEPTIONS)
    'NEVER leave voicemail - no exceptions, no fallback, no shortened version',
    'First spoken line must be: "Hi, may I speak with {{contact.full_name}}, the {{contact.job_title}} at {{account.name}}?"',
    'If voicemail is offered by anyone, say: "That\'s okay — I\'ll try again later. Thank you." then END CALL immediately',
    'If call routes directly to voicemail: Do NOT speak, do NOT record anything, do NOT introduce yourself - end call silently',
    'If gatekeeper mentions voicemail ("leave a voicemail", "send to voicemail", "goes to voicemail"), say: "No problem — I\'ll try again later. Thank you." then END CALL',
    'Log voicemail outcomes as: VOICEMAIL_DETECTED with voicemail_left: false (always)',
    // HUMANITY, KINDNESS & PROFESSIONAL ETIQUETTE (MANDATORY)
    'Be kind, respectful, warm but not casual, professional never robotic, humble never entitled, calm never rushed',
    'Sound like a thoughtful professional who respects time, appreciates permission, and never assumes access',
    // GRATITUDE (Always express when someone: allows you to speak, gives time, answers questions, considers follow-up, or listens)',
    'Use gratitude phrases naturally: "Thank you — I appreciate that", "I really appreciate you giving me a moment", "Thanks for taking the time", "I appreciate you hearing me out", "That\'s very kind of you — thank you"',
    // POLITE APOLOGY FOR INTERRUPTION (cold call, busy signal, hesitation)',
    'Use apology phrases when interrupting: "I apologize for the interruption", "Sorry to catch you unexpectedly", "I\'ll be very brief — I appreciate your patience", "I understand this may not be a good time"',
    // RESPECT PERMISSION - When given "20 seconds" or "briefly", stay within that time and acknowledge it',
    'When permission granted, acknowledge: "Thank you — I\'ll keep this to the 20 seconds you offered"',
    // WARM ACCEPTANCE - When interest shown, respond with genuine appreciation',
    'When interest shown: "Thank you very much — I really appreciate that", "That\'s great, thank you for your openness", "I appreciate you being willing to explore this"',
    // GRACEFUL EXIT - Every call must end kindly, even blocked ones',
    'End calls gracefully: "Thank you for your time — I appreciate it", "Thanks again, have a great rest of your day", "I appreciate your help — thank you"',
    // FORBIDDEN: Sounding rushed, entitled, indifferent, overly cheerful/salesy, over-apologizing, emotional manipulation',
  ],
  demand_intel: ['Summarize key buying signals', 'Capture competitor mentions', 'Highlight tech stack clues'],
  demand_qual: [
    'Confirm need, timeline, and authority',
    'Surface objections and summarize responses',
    // VOICEMAIL POLICY (MANDATORY)
    'NEVER leave voicemail under any circumstances',
    'If voicemail detected or offered, politely decline and end call immediately',
    // HUMANITY LAYER
    'Always express gratitude when given time or permission',
    'Apologize politely for interruption at call start',
    'End every call with warm, professional gratitude',
  ],
  demand_engage: ['Personalize by ICP and role', 'Suggest next-step CTAs tuned to engagement level'],
};

const AGENT_TYPES = [
  { key: 'general_intelligence' as const, label: '🧠 General Intelligence', description: 'Universal conversational intelligence, humanity, and emotional awareness' },
  { key: 'generic' as const, label: 'Generic Agent', description: 'Default training for all agent types' },
  { key: 'demand_intel' as const, label: 'Demand Intelligence Agent', description: 'Account research and buying signal analysis' },
  { key: 'demand_qual' as const, label: 'Voice Qualification Agent', description: 'BANT qualification and objection handling' },
  { key: 'demand_engage' as const, label: 'Email Engagement Agent', description: 'Personalized email sequences and optimization' },
];

export function TrainingCenterTab() {
  const { toast } = useToast();
  const [trainingCenter, setTrainingCenter] = useState(DEFAULT_TRAINING_CENTER);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('virtual-agent-training-center');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTrainingCenter({ ...DEFAULT_TRAINING_CENTER, ...parsed });
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem('virtual-agent-training-center', JSON.stringify(trainingCenter));
      setHasChanges(false);
      toast({
        title: 'Training Center saved',
        description: 'Training defaults will be used when generating agent prompts.',
      });
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Could not save training center',
        variant: 'destructive',
      });
    }
  };

  const handleReset = () => {
    setTrainingCenter(DEFAULT_TRAINING_CENTER);
    setHasChanges(true);
    toast({
      title: 'Reset to defaults',
      description: 'Click Save to persist the changes.',
    });
  };

  const updateTrainingItems = (key: keyof TrainingCenter, items: string[]) => {
    setTrainingCenter(prev => ({ ...prev, [key]: items }));
    setHasChanges(true);
  };

  return (
    
      
        
          
            
              
              
                Training Center
                
                  Define training defaults that will be automatically included in agent system prompts based on their type
                
              
            
            
              
                Reset to Defaults
              
              
                
                Save Changes
              
            
          
        
      

      
        {AGENT_TYPES.map(agentType => (
          
            
              {agentType.label}
              {agentType.description}
            
            
              
                Training snippets (one per line)
                 {
                    const lines = e.target.value
                      .split('\n')
                      .map(line => line.trim())
                      .filter(Boolean);
                    updateTrainingItems(agentType.key, lines);
                  }}
                  placeholder="Enter training snippets, best practices, FAQs, or edge case handling..."
                  className="min-h-[120px] font-mono text-sm"
                />
                
                  These training snippets will be automatically included in the system prompt when generating prompts for {agentType.label} agents.
                
              

              
                Current training items:
                {trainingCenter[agentType.key].length === 0 ? (
                  No training items defined yet
                ) : (
                  
                    {trainingCenter[agentType.key].map((item, idx) => (
                      {item}
                    ))}
                  
                )}
              
            
          
        ))}
      
    
  );
}