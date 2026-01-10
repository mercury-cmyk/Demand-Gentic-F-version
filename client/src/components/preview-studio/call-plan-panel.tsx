import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Phone,
  MessageSquare,
  Target,
  AlertTriangle,
  Lightbulb,
  User,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CallPlanResponse {
  sessionId: string;
  accountCallBrief: {
    theme: string;
    safe_problem_frame: string;
    opening_posture: string;
    one_sentence_insight: string;
    success_definition: string;
    avoid: string[];
    confidence: number;
  };
  participantCallPlan: {
    opening_lines: string[];
    first_question: string;
    micro_insight: string;
    cta: string;
    branching: {
      gatekeeper: { ask: string; fallback: string };
      objection_busy: { response: string };
      objection_not_interested: { response: string };
      voicemail: { message: string };
    };
  };
  participantContext: {
    name: string;
    role: string;
    seniority: string;
    relationship_state: string;
    prior_touches: string[];
    channel_preference: string;
    last_call_outcome: string | null;
  };
  memoryNotes: Array<{ content: string; createdAt: Date }>;
}

interface PreviewContext {
  accountCallBrief?: any;
  participantCallPlan?: any;
  participantContext?: any;
}

interface CallPlanPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
  previewContext?: PreviewContext;
  isLoading?: boolean;
}

export function CallPlanPanel({
  campaignId,
  accountId,
  contactId,
  previewContext,
  isLoading,
}: CallPlanPanelProps) {
  // Fetch detailed call plan if contact is selected
  const { data: callPlanData, isLoading: planLoading } = useQuery<CallPlanResponse>({
    queryKey: ['/api/preview-studio/generate-call-plan', campaignId, accountId, contactId],
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/preview-studio/generate-call-plan', {
        campaignId,
        accountId,
        contactId,
      });
      return response.json();
    },
    enabled: !!(campaignId && accountId && contactId),
  });

  // Use either the detailed call plan or the preview context
  const callBrief = callPlanData?.accountCallBrief || previewContext?.accountCallBrief;
  const callPlan = callPlanData?.participantCallPlan || previewContext?.participantCallPlan;
  const participantContext = callPlanData?.participantContext || previewContext?.participantContext;

  const loading = isLoading || planLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!callBrief && !callPlan) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Call Plan Available</h2>
          <p className="text-muted-foreground">
            {!contactId
              ? "Select a contact to generate a participant-specific call plan."
              : "Call plan could not be generated for this context."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Participant Context */}
      {participantContext && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              Participant Context
            </CardTitle>
            <CardDescription>
              How this contact is understood by the AI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{participantContext.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="font-medium">{participantContext.role || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Seniority</p>
                <p className="font-medium">{participantContext.seniority || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship State</p>
                <Badge variant={
                  participantContext.relationship_state === 'engaged' ? 'default' :
                  participantContext.relationship_state === 'cold' ? 'secondary' : 'outline'
                }>
                  {participantContext.relationship_state || 'Unknown'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Channel Preference</p>
                <p className="font-medium">{participantContext.channel_preference || 'Unknown'}</p>
              </div>
              {participantContext.last_call_outcome && (
                <div>
                  <p className="text-xs text-muted-foreground">Last Call Outcome</p>
                  <p className="font-medium">{participantContext.last_call_outcome}</p>
                </div>
              )}
            </div>
            {participantContext.prior_touches && participantContext.prior_touches.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Prior Touches</p>
                <div className="flex flex-wrap gap-2">
                  {participantContext.prior_touches.map((touch, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {touch}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Account Call Brief */}
      {callBrief && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" />
              Account Call Brief
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Strategic context for this account
              {callBrief.confidence !== undefined && (
                <Badge variant={callBrief.confidence > 0.7 ? "default" : "secondary"}>
                  {Math.round(callBrief.confidence * 100)}% confidence
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {callBrief.theme && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Theme</p>
                <p className="mt-1">{callBrief.theme}</p>
              </div>
            )}
            {callBrief.safe_problem_frame && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Problem Frame</p>
                <p className="mt-1">{callBrief.safe_problem_frame}</p>
              </div>
            )}
            {callBrief.one_sentence_insight && (
              <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
                <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Key Insight</p>
                  <p className="text-sm mt-1">{callBrief.one_sentence_insight}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {callBrief.opening_posture && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Opening Posture</p>
                  <Badge variant="outline" className="mt-1">{callBrief.opening_posture}</Badge>
                </div>
              )}
              {callBrief.success_definition && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Definition</p>
                  <p className="text-sm mt-1">{callBrief.success_definition}</p>
                </div>
              )}
            </div>
            {callBrief.avoid && callBrief.avoid.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-destructive/5 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Avoid Mentioning</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {callBrief.avoid.map((item: string, i: number) => (
                      <Badge key={i} variant="destructive" className="text-xs">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Participant Call Plan */}
      {callPlan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Participant Call Plan
            </CardTitle>
            <CardDescription>
              Personalized call flow for this contact
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Opening Lines */}
            {callPlan.opening_lines && callPlan.opening_lines.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Opening Line Options</p>
                <div className="space-y-2">
                  {callPlan.opening_lines.map((line: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                      <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                      <p className="text-sm">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* First Question */}
            {callPlan.first_question && (
              <div className="flex items-start gap-2 p-3 bg-blue-500/5 rounded-lg">
                <HelpCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Discovery Question</p>
                  <p className="text-sm mt-1">{callPlan.first_question}</p>
                </div>
              </div>
            )}

            {/* Micro Insight */}
            {callPlan.micro_insight && (
              <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
                <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Micro Insight</p>
                  <p className="text-sm mt-1">{callPlan.micro_insight}</p>
                </div>
              </div>
            )}

            {/* CTA */}
            {callPlan.cta && (
              <div className="flex items-start gap-2 p-3 bg-green-500/5 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Call to Action</p>
                  <p className="text-sm mt-1">{callPlan.cta}</p>
                </div>
              </div>
            )}

            {/* Branching Logic */}
            {callPlan.branching && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Branching Responses</p>
                <Accordion type="multiple" className="w-full">
                  {callPlan.branching.gatekeeper && (
                    <AccordionItem value="gatekeeper">
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Gatekeeper Handling
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2">
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-xs text-muted-foreground">Primary Ask</p>
                          <p className="text-sm">{callPlan.branching.gatekeeper.ask}</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-xs text-muted-foreground">Fallback</p>
                          <p className="text-sm">{callPlan.branching.gatekeeper.fallback}</p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                  {callPlan.branching.objection_busy && (
                    <AccordionItem value="busy">
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-yellow-500" />
                          "I'm busy" Objection
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-sm">{callPlan.branching.objection_busy.response}</p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                  {callPlan.branching.objection_not_interested && (
                    <AccordionItem value="not-interested">
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          "Not interested" Objection
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-sm">{callPlan.branching.objection_not_interested.response}</p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                  {callPlan.branching.voicemail && (
                    <AccordionItem value="voicemail">
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          Voicemail Script
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-sm">{callPlan.branching.voicemail.message}</p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
