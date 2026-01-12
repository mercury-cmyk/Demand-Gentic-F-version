import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Phone,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  BarChart3,
  Lightbulb,
  RefreshCw,
  User,
  Building2,
  Briefcase,
  Mail,
  Mic,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface TestCall {
  id: string;
  campaignId: string;
  virtualAgentId: string | null;
  testPhoneNumber: string;
  testContactName: string;
  testCompanyName: string | null;
  testJobTitle: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  disposition: string | null;
  testResult: string | null;
  callSummary: string | null;
  aiPerformanceMetrics: any;
  detectedIssues: any[] | null;
  recordingUrl: string | null;
  createdAt: string;
  agentName?: string | null;
}

interface TestCallSummary {
  stats: {
    total: number;
    completed: number;
    successful: number;
    needsImprovement: number;
    failed: number;
    avgDuration: number | null;
  };
  commonIssues: { type: string; count: number }[];
}

interface CampaignTestPanelProps {
  campaignId: string;
  campaignName: string;
  dialMode?: string;
}

function normalizePhoneToE164(phone: string | null, country: string = 'US'): string | null {
  if (!phone) return null;

  let cleanedPhone = phone.trim();

  if (cleanedPhone.match(/^\+440\d{10,}$/)) {
    cleanedPhone = '+44' + cleanedPhone.substring(4);
  }

  try {
    const phoneNumber = parsePhoneNumberFromString(cleanedPhone, country as any);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.number;
    }
  } catch {
    return null;
  }

  return null;
}

export function CampaignTestPanel({ campaignId, campaignName, dialMode }: CampaignTestPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [selectedTestCall, setSelectedTestCall] = useState<TestCall | null>(null);
  const [callState, setCallState] = useState<'idle' | 'initiating'>('idle');
  const [testFormData, setTestFormData] = useState({
    testPhoneNumber: "",
    testContactName: "Zahid Mohammadi",
    testCompanyName: "Pivotal B2B",
    testJobTitle: "Founder",
    testContactEmail: "zahid@pivotal-b2b.com",
    voiceProvider: "openai" as "openai" | "google",
  });

  const showLoggedTests = true;

  // Fetch test calls for this campaign
  const { data: testCallsData, isLoading: testCallsLoading } = useQuery<{
    testCalls: TestCall[];
    total: number;
  }>({
    queryKey: [`/api/campaigns/${campaignId}/test-calls`],
    enabled: dialMode === "ai_agent" && showLoggedTests,
  });

  // Fetch test calls summary
  const { data: summary, isLoading: summaryLoading } = useQuery<TestCallSummary>({
    queryKey: [`/api/campaigns/${campaignId}/test-calls-summary`],
    enabled: dialMode === "ai_agent" && showLoggedTests,
  });

  // Analyze test call mutation
  const analyzeTestMutation = useMutation({
    mutationFn: async (testCallId: string) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/test-calls/${testCallId}/analyze`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Analysis Complete",
        description: `Test result: ${data.analysis?.testResult || 'Unknown'}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/test-calls`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Initiate test call via server-side API (no browser SIP needed)
  const initiateTestMutation = useMutation({
    mutationFn: async () => {
      const normalizedPhone = normalizePhoneToE164(testFormData.testPhoneNumber);
      if (!normalizedPhone) {
        throw new Error("Invalid phone number format");
      }
      
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/test-call`, {
        testPhoneNumber: normalizedPhone,
        testContactName: testFormData.testContactName,
        testCompanyName: testFormData.testCompanyName || undefined,
        testJobTitle: testFormData.testJobTitle || undefined,
        testContactEmail: testFormData.testContactEmail || undefined,
        voiceProvider: testFormData.voiceProvider,
      });
      return response.json();
    },
    onMutate: () => {
      setCallState('initiating');
    },
    onSuccess: () => {
      setCallState('idle');
      setIsTestDialogOpen(false);
      toast({
        title: "Test Call Started",
        description: `Calling ${testFormData.testPhoneNumber} via AI agent...`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/test-calls`] });
    },
    onError: (error: Error) => {
      setCallState('idle');
      toast({
        title: "Test Call Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInitiateTest = () => {
    if (!testFormData.testPhoneNumber || !testFormData.testContactName) {
      toast({
        title: "Missing Required Fields",
        description: "Phone number and contact name are required",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone = normalizePhoneToE164(testFormData.testPhoneNumber);
    if (!normalizedPhone) {
      toast({
        title: "Invalid phone number",
        description: "Enter a valid phone number in E.164 format (e.g., +14155552671).",
        variant: "destructive",
      });
      return;
    }

    initiateTestMutation.mutate();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="border-blue-500 text-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />In Progress</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case 'success':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
      case 'needs_improvement':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertTriangle className="w-3 h-3 mr-1" />Needs Improvement</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">Not Analyzed</Badge>;
    }
  };

  // Don't show for non-AI campaigns
  if (dialMode !== "ai_agent") {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              AI Test Calls
            </CardTitle>
            <CardDescription>
              Preview Studio is for AI simulation. Test calls use server-side dialing.
            </CardDescription>
          </div>
          <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-test-call">
                <Play className="h-4 w-4 mr-2" />
                New Test Call
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Initiate Test Call</DialogTitle>
                <DialogDescription>
                  Use server-side dialing to validate call flow. AI prompt rehearsal happens in Preview Studio.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="test-phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone Number *
                  </Label>
                  <Input
                    id="test-phone"
                    placeholder="+44 7700 900123"
                    value={testFormData.testPhoneNumber}
                    onChange={(e) => setTestFormData(prev => ({ ...prev, testPhoneNumber: e.target.value }))}
                    data-testid="input-test-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-name" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Contact Name *
                  </Label>
                  <Input
                    id="test-name"
                    placeholder="John Smith"
                    value={testFormData.testContactName}
                    onChange={(e) => setTestFormData(prev => ({ ...prev, testContactName: e.target.value }))}
                    data-testid="input-test-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-company" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Company Name
                  </Label>
                  <Input
                    id="test-company"
                    placeholder="Acme Corporation"
                    value={testFormData.testCompanyName}
                    onChange={(e) => setTestFormData(prev => ({ ...prev, testCompanyName: e.target.value }))}
                    data-testid="input-test-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-title" className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Job Title
                  </Label>
                  <Input
                    id="test-title"
                    placeholder="Marketing Director"
                    value={testFormData.testJobTitle}
                    onChange={(e) => setTestFormData(prev => ({ ...prev, testJobTitle: e.target.value }))}
                    data-testid="input-test-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email (Optional)
                  </Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="john@acme.com"
                    value={testFormData.testContactEmail}
                    onChange={(e) => setTestFormData(prev => ({ ...prev, testContactEmail: e.target.value }))}
                    data-testid="input-test-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-provider" className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Voice Provider
                  </Label>
                  <Select
                    value={testFormData.voiceProvider}
                    onValueChange={(value: "openai" | "google") =>
                      setTestFormData(prev => ({ ...prev, voiceProvider: value }))
                    }
                  >
                    <SelectTrigger id="voice-provider" data-testid="select-voice-provider">
                      <SelectValue placeholder="Select voice provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI Realtime</SelectItem>
                      <SelectItem value="google">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    OpenAI Realtime offers natural conversation. Gemini is faster and more cost-effective.
                  </p>
                </div>
              </div>
              <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Call state</span>
                  <span className="uppercase">{callState}</span>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsTestDialogOpen(false)}
                  data-testid="button-cancel-test"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInitiateTest}
                  disabled={callState === 'initiating'}
                  data-testid="button-start-test"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  {callState === 'initiating' ? "Starting..." : "Start Test Call"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        {showLoggedTests && summaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : showLoggedTests && summary ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{summary.stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Tests</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{summary.stats.successful}</div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{summary.stats.needsImprovement}</div>
              <div className="text-xs text-muted-foreground">Needs Work</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{summary.stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {summary.stats.avgDuration ? `${Math.round(summary.stats.avgDuration)}s` : '-'}
              </div>
              <div className="text-xs text-muted-foreground">Avg Duration</div>
            </div>
          </div>
        ) : null}

        {/* Common Issues */}
        {showLoggedTests && summary?.commonIssues && summary.commonIssues.length > 0 && (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Common Issues Detected
            </h4>
            <div className="flex flex-wrap gap-2">
              {summary.commonIssues.map((issue, idx) => (
                <Badge key={idx} variant="outline" className="border-yellow-500/50">
                  {issue.type} ({issue.count})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Test Calls Table */}
        {showLoggedTests ? (
          testCallsLoading ? (
            <Skeleton className="h-64" />
          ) : testCallsData?.testCalls && testCallsData.testCalls.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testCallsData.testCalls.map((testCall) => (
                    <TableRow key={testCall.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{testCall.testContactName}</div>
                          {testCall.testCompanyName && (
                            <div className="text-xs text-muted-foreground">{testCall.testCompanyName}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{testCall.testPhoneNumber}</TableCell>
                      <TableCell>{getStatusBadge(testCall.status)}</TableCell>
                      <TableCell>{getResultBadge(testCall.testResult)}</TableCell>
                      <TableCell>
                        {testCall.durationSeconds ? `${testCall.durationSeconds}s` : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(testCall.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {testCall.status === 'completed' && !testCall.testResult && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => analyzeTestMutation.mutate(testCall.id)}
                              disabled={analyzeTestMutation.isPending}
                            >
                              {analyzeTestMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <BarChart3 className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedTestCall(testCall)}
                          >
                            <MessageSquare className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No test calls yet</p>
              <p className="text-sm mt-2">Run a test call to validate your AI agent before launching</p>
            </div>
          )
        ) : null}

        {/* Test Call Details Dialog */}
        <Dialog open={!!selectedTestCall} onOpenChange={() => setSelectedTestCall(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            {selectedTestCall && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Test Call Details
                  </DialogTitle>
                  <DialogDescription>
                    {selectedTestCall.testContactName} at {selectedTestCall.testCompanyName || 'Unknown Company'}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <div className="mt-1">{getStatusBadge(selectedTestCall.status)}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Result</Label>
                      <div className="mt-1">{getResultBadge(selectedTestCall.testResult)}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Duration</Label>
                      <div className="mt-1 font-medium">
                        {selectedTestCall.durationSeconds ? `${selectedTestCall.durationSeconds} seconds` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Disposition</Label>
                      <div className="mt-1 font-medium capitalize">
                        {selectedTestCall.disposition?.replace(/_/g, ' ') || 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Call Summary */}
                  {selectedTestCall.callSummary && (
                    <div>
                      <Label className="text-muted-foreground">Call Summary</Label>
                      <div className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                        {selectedTestCall.callSummary}
                      </div>
                    </div>
                  )}

                  {/* Performance Metrics */}
                  {selectedTestCall.aiPerformanceMetrics && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="metrics">
                        <AccordionTrigger className="text-sm">
                          <span className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Performance Metrics
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-2 gap-3 pt-2">
                            {Object.entries(selectedTestCall.aiPerformanceMetrics).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-center p-2 bg-muted/30 rounded">
                                <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="font-medium">
                                  {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  {/* Detected Issues */}
                  {selectedTestCall.detectedIssues && selectedTestCall.detectedIssues.length > 0 && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="issues">
                        <AccordionTrigger className="text-sm">
                          <span className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            Detected Issues ({selectedTestCall.detectedIssues.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {selectedTestCall.detectedIssues.map((issue: any, idx: number) => (
                              <div key={idx} className="border rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                  <Badge
                                    variant={
                                      issue.severity === 'high' ? 'destructive' :
                                      issue.severity === 'medium' ? 'default' : 'secondary'
                                    }
                                    className="text-xs"
                                  >
                                    {issue.severity}
                                  </Badge>
                                  <div>
                                    <div className="font-medium text-sm">{issue.type}</div>
                                    <div className="text-sm text-muted-foreground mt-1">{issue.description}</div>
                                    {issue.suggestion && (
                                      <div className="text-sm text-green-600 mt-2 flex items-start gap-1">
                                        <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        {issue.suggestion}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  {/* Recording */}
                  {selectedTestCall.recordingUrl && (
                    <div>
                      <Label className="text-muted-foreground">Recording</Label>
                      <div className="mt-2">
                        <audio controls className="w-full">
                          <source src={selectedTestCall.recordingUrl} type="audio/mpeg" />
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  {selectedTestCall.status === 'completed' && !selectedTestCall.testResult && (
                    <Button
                      onClick={() => {
                        analyzeTestMutation.mutate(selectedTestCall.id);
                        setSelectedTestCall(null);
                      }}
                      disabled={analyzeTestMutation.isPending}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analyze Call
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedTestCall(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
