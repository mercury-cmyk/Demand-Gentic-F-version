/**
 * Call Flow Management Page
 *
 * Admin page for managing pre-set call flows for all campaign types.
 * Full CRUD support: view, create, edit, duplicate, delete call flows.
 * Step-level editing: add, remove, reorder, and modify steps.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Phone,
  Settings,
  Play,
  Pause,
  GitBranch,
  Target,
  CheckCircle2,
  AlertCircle,
  Edit,
  Eye,
  Copy,
  Save,
  ArrowRight,
  MessageSquare,
  Users,
  Calendar,
  FileText,
  Megaphone,
  Briefcase,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  X,
  Lock,
  Unlock,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { SettingsLayout } from '@/components/settings/settings-layout';

// Campaign type configurations
const CAMPAIGN_TYPES = [
  { id: 'appointment_generation', name: 'Appointment Generation', icon: Calendar, description: 'Book qualified meetings with decision makers' },
  { id: 'sql', name: 'SQL (Sales Qualified Leads)', icon: Target, description: 'Qualify leads for sales-readiness' },
  { id: 'telemarketing', name: 'Telemarketing', icon: Phone, description: 'General telemarketing campaigns' },
  { id: 'high_quality_leads', name: 'High Quality Leads (HQL)', icon: Users, description: 'Generate high-quality lead engagement' },
  { id: 'live_webinar', name: 'Live Webinar', icon: Play, description: 'Register attendees for live webinars' },
  { id: 'on_demand_webinar', name: 'On-Demand Webinar', icon: Pause, description: 'Drive registrations for recorded content' },
  { id: 'content_syndication', name: 'Content Syndication', icon: FileText, description: 'Follow up on content downloads' },
  { id: 'executive_dinner', name: 'Executive Dinner', icon: Briefcase, description: 'Secure RSVPs for exclusive events' },
  { id: 'leadership_forum', name: 'Leadership Forum', icon: Users, description: 'Invite to leadership events' },
  { id: 'conference', name: 'Conference', icon: Megaphone, description: 'Drive conference attendance' },
  { id: 'call', name: 'Generic Call', icon: Phone, description: 'Flexible outbound calling' },
];

// Step state icons and colors
const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  'IDENTITY_CHECK': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  'RIGHT_PARTY_INTRO': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  'CONTEXT_FRAMING': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  'DISCOVERY': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
  'LISTENING': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
  'ACKNOWLEDGEMENT': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300' },
  'PERMISSION_REQUEST': { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
  'CLOSE': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  'END': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
};

const VOICE_AGENT_STATES = [
  'IDENTITY_CHECK',
  'RIGHT_PARTY_INTRO',
  'CONTEXT_FRAMING',
  'DISCOVERY',
  'LISTENING',
  'ACKNOWLEDGEMENT',
  'PERMISSION_REQUEST',
  'CLOSE',
  'END',
];

const AVAILABLE_INTENTS = [
  'request_permission',
  'acknowledge',
  'ask_question',
  'listen',
  'share_insight',
  'propose_meeting',
  'schedule_meeting',
  'confirm_details',
  'exit_call',
  'handle_objection',
  'refer_to_colleague',
];

const FALLBACK_ACTIONS = [
  'repeat',
  'escalate',
  'exit',
  'next',
  'clarify',
  'proceed',
  'ask',
  'confirm',
  'probe',
  'emphasize',
  'offer',
  'summarize',
  'alternative',
  'offer_callback',
  'pivot',
];

interface CallFlowStep {
  stepId: string;
  name: string;
  mappedState: string;
  goal: string;
  allowedIntents: string[];
  forbiddenIntents?: string[];
  allowedQuestions: number;
  maxTurnsInStep: number;
  mustDo?: string[];
  mustNotDo?: string[];
  exitCriteria: { signal: string; description: string; nextStep?: string }[];
  branches?: { trigger: string; condition: string; targetStep?: string; capability?: string; description: string }[];
  fallback?: { action: string; maxAttempts?: number; message?: string };
}

interface CallFlow {
  id: string;
  name: string;
  objective: string;
  successCriteria: string;
  maxTotalTurns: number;
  steps: CallFlowStep[];
  isDefault?: boolean;
  isSystemFlow?: boolean;
  version?: number;
}

interface CampaignTypeMapping {
  campaignType: string;
  callFlowId: string;
  callFlowName: string;
}

// Default empty step template
const createEmptyStep = (index: number): CallFlowStep => ({
  stepId: `step-${index + 1}-new`,
  name: `New Step ${index + 1}`,
  mappedState: 'DISCOVERY',
  goal: '',
  allowedIntents: ['ask_question', 'acknowledge', 'listen'],
  forbiddenIntents: [],
  allowedQuestions: 2,
  maxTurnsInStep: 5,
  mustDo: [],
  mustNotDo: [],
  exitCriteria: [],
  branches: [],
  fallback: { action: 'proceed' },
});

export default function CallFlowManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Dialog states
  const [selectedFlow, setSelectedFlow] = useState<CallFlow | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stepEditDialogOpen, setStepEditDialogOpen] = useState(false);

  // Form states
  const [selectedCampaignType, setSelectedCampaignType] = useState<string>('');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [editingFlow, setEditingFlow] = useState<CallFlow | null>(null);
  const [editingStep, setEditingStep] = useState<CallFlowStep | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number>(-1);

  // Only allow admins/managers
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return <Redirect to="/" />;
  }

  // Fetch all available call flows
  const { data: callFlowsData, isLoading: flowsLoading } = useQuery<{ callFlows: CallFlow[] }>({
    queryKey: ['/api/call-flows/all'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/call-flows/all');
      return res.json();
    },
  });

  // Fetch campaign type mappings
  const { data: mappingsData, isLoading: mappingsLoading } = useQuery<{ mappings: CampaignTypeMapping[] }>({
    queryKey: ['/api/call-flows/mappings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/call-flows/mappings');
      return res.json();
    },
  });

  // Mutations
  const updateMappingMutation = useMutation({
    mutationFn: async ({ campaignType, callFlowId }: { campaignType: string; callFlowId: string }) => {
      const res = await apiRequest('POST', '/api/call-flows/mappings', { campaignType, callFlowId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-flows/mappings'] });
      setAssignDialogOpen(false);
      toast({ title: 'Mapping Updated', description: 'Campaign type call flow assignment has been updated.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update mapping' });
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: async (flow: Partial<CallFlow>) => {
      const res = await apiRequest('POST', '/api/call-flows', flow);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-flows/all'] });
      setCreateDialogOpen(false);
      setEditingFlow(null);
      toast({ title: 'Call Flow Created', description: 'Your new call flow has been created successfully.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to create call flow' });
    },
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ flowId, data }: { flowId: string; data: Partial<CallFlow> }) => {
      const res = await apiRequest('PUT', `/api/call-flows/${flowId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-flows/all'] });
      setEditDialogOpen(false);
      setEditingFlow(null);
      toast({ title: 'Call Flow Updated', description: 'Your call flow has been updated successfully.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update call flow' });
    },
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const res = await apiRequest('DELETE', `/api/call-flows/${flowId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-flows/all'] });
      setDeleteDialogOpen(false);
      setSelectedFlow(null);
      toast({ title: 'Call Flow Deleted', description: 'The call flow has been deleted.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete call flow' });
    },
  });

  const duplicateFlowMutation = useMutation({
    mutationFn: async ({ flowId, name }: { flowId: string; name?: string }) => {
      const res = await apiRequest('POST', `/api/call-flows/${flowId}/duplicate`, { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-flows/all'] });
      toast({ title: 'Call Flow Duplicated', description: 'A copy has been created and is ready for editing.' });
      // Open the duplicated flow for editing
      if (data.callFlow) {
        setEditingFlow(data.callFlow);
        setEditDialogOpen(true);
      }
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to duplicate call flow' });
    },
  });

  const callFlows = callFlowsData?.callFlows || [];
  const mappings = mappingsData?.mappings || [];

  const getFlowForCampaignType = (campaignType: string) => {
    const mapping = mappings.find(m => m.campaignType === campaignType);
    if (mapping) {
      return callFlows.find(f => f.id === mapping.callFlowId);
    }
    return null;
  };

  const handleViewFlow = (flow: CallFlow) => {
    setSelectedFlow(flow);
    setViewDialogOpen(true);
  };

  const handleEditFlow = (flow: CallFlow) => {
    if (flow.isSystemFlow) {
      // For system flows, automatically duplicate and open for editing
      toast({
        title: 'Creating Editable Copy',
        description: 'System flows cannot be modified directly. Creating a copy for editing...',
      });
      duplicateFlowMutation.mutate({ flowId: flow.id });
      return;
    }
    setEditingFlow(JSON.parse(JSON.stringify(flow))); // Deep clone
    setEditDialogOpen(true);
  };

  const handleDuplicateFlow = (flow: CallFlow) => {
    duplicateFlowMutation.mutate({ flowId: flow.id });
  };

  const handleDeleteFlow = (flow: CallFlow) => {
    if (flow.isSystemFlow) {
      toast({ variant: 'destructive', title: 'Cannot Delete', description: 'System flows cannot be deleted.' });
      return;
    }
    setSelectedFlow(flow);
    setDeleteDialogOpen(true);
  };

  const handleAssignFlow = (campaignType: string) => {
    setSelectedCampaignType(campaignType);
    const currentMapping = mappings.find(m => m.campaignType === campaignType);
    setSelectedFlowId(currentMapping?.callFlowId || '');
    setAssignDialogOpen(true);
  };

  const handleSaveMapping = () => {
    if (selectedCampaignType && selectedFlowId) {
      updateMappingMutation.mutate({ campaignType: selectedCampaignType, callFlowId: selectedFlowId });
    }
  };

  const handleCreateNew = () => {
    setEditingFlow({
      id: '',
      name: 'New Call Flow',
      objective: '',
      successCriteria: '',
      maxTotalTurns: 20,
      steps: [createEmptyStep(0)],
      isDefault: false,
      isSystemFlow: false,
      version: 1,
    });
    setCreateDialogOpen(true);
  };

  const handleSaveNewFlow = () => {
    if (!editingFlow) return;
    createFlowMutation.mutate({
      name: editingFlow.name,
      objective: editingFlow.objective,
      successCriteria: editingFlow.successCriteria,
      maxTotalTurns: editingFlow.maxTotalTurns,
      steps: editingFlow.steps,
    });
  };

  const handleSaveEditedFlow = () => {
    if (!editingFlow) return;
    updateFlowMutation.mutate({
      flowId: editingFlow.id,
      data: {
        name: editingFlow.name,
        objective: editingFlow.objective,
        successCriteria: editingFlow.successCriteria,
        maxTotalTurns: editingFlow.maxTotalTurns,
        steps: editingFlow.steps,
      },
    });
  };

  // Step management functions
  const moveStepUp = (index: number) => {
    if (!editingFlow || index === 0) return;
    const newSteps = [...editingFlow.steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setEditingFlow({ ...editingFlow, steps: newSteps });
  };

  const moveStepDown = (index: number) => {
    if (!editingFlow || index === editingFlow.steps.length - 1) return;
    const newSteps = [...editingFlow.steps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    setEditingFlow({ ...editingFlow, steps: newSteps });
  };

  const addStep = (atIndex?: number) => {
    if (!editingFlow) return;
    const newStep = createEmptyStep(editingFlow.steps.length);
    const newSteps = [...editingFlow.steps];
    if (typeof atIndex === 'number') {
      newSteps.splice(atIndex + 1, 0, newStep);
    } else {
      newSteps.push(newStep);
    }
    setEditingFlow({ ...editingFlow, steps: newSteps });
  };

  const removeStep = (index: number) => {
    if (!editingFlow || editingFlow.steps.length <= 1) return;
    const newSteps = editingFlow.steps.filter((_, i) => i !== index);
    setEditingFlow({ ...editingFlow, steps: newSteps });
  };

  const openStepEditor = (step: CallFlowStep, index: number) => {
    setEditingStep(JSON.parse(JSON.stringify(step)));
    setEditingStepIndex(index);
    setStepEditDialogOpen(true);
  };

  const saveStepChanges = () => {
    if (!editingFlow || !editingStep || editingStepIndex < 0) return;
    const newSteps = [...editingFlow.steps];
    newSteps[editingStepIndex] = editingStep;
    setEditingFlow({ ...editingFlow, steps: newSteps });
    setStepEditDialogOpen(false);
    setEditingStep(null);
    setEditingStepIndex(-1);
  };

  // Render step editor content
  const renderStepEditor = () => {
    if (!editingStep) return null;

    return (
      <ScrollArea className="h-[60vh]">
        <div className="space-y-6 pr-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="font-medium">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Step Name</Label>
                <Input
                  value={editingStep.name}
                  onChange={(e) => setEditingStep({ ...editingStep, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mapped State</Label>
                <Select
                  value={editingStep.mappedState}
                  onValueChange={(val) => setEditingStep({ ...editingStep, mappedState: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_AGENT_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Textarea
                value={editingStep.goal}
                onChange={(e) => setEditingStep({ ...editingStep, goal: e.target.value })}
                placeholder="What should the agent accomplish in this step?"
              />
            </div>
          </div>

          <Separator />

          {/* Turn Controls */}
          <div className="space-y-4">
            <h4 className="font-medium">Turn Controls</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Questions Allowed</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={editingStep.allowedQuestions}
                  onChange={(e) => setEditingStep({ ...editingStep, allowedQuestions: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Turns in Step</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={editingStep.maxTurnsInStep}
                  onChange={(e) => setEditingStep({ ...editingStep, maxTurnsInStep: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Intents */}
          <div className="space-y-4">
            <h4 className="font-medium">Allowed Intents</h4>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_INTENTS.map((intent) => {
                const isAllowed = editingStep.allowedIntents.includes(intent);
                return (
                  <Badge
                    key={intent}
                    variant={isAllowed ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      if (isAllowed) {
                        setEditingStep({
                          ...editingStep,
                          allowedIntents: editingStep.allowedIntents.filter(i => i !== intent),
                        });
                      } else {
                        setEditingStep({
                          ...editingStep,
                          allowedIntents: [...editingStep.allowedIntents, intent],
                        });
                      }
                    }}
                  >
                    {isAllowed && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {intent.replace(/_/g, ' ')}
                  </Badge>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Must Do / Must Not Do */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Must Do
              </Label>
              <Textarea
                value={(editingStep.mustDo || []).join('\n')}
                onChange={(e) => setEditingStep({
                  ...editingStep,
                  mustDo: e.target.value.split('\n').filter(Boolean),
                })}
                placeholder="One item per line"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <X className="h-4 w-4 text-red-600" />
                Must Not Do
              </Label>
              <Textarea
                value={(editingStep.mustNotDo || []).join('\n')}
                onChange={(e) => setEditingStep({
                  ...editingStep,
                  mustNotDo: e.target.value.split('\n').filter(Boolean),
                })}
                placeholder="One item per line"
                rows={4}
              />
            </div>
          </div>

          <Separator />

          {/* Exit Criteria */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Exit Criteria</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingStep({
                  ...editingStep,
                  exitCriteria: [...editingStep.exitCriteria, { signal: '', description: '', nextStep: '' }],
                })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Exit
              </Button>
            </div>
            {editingStep.exitCriteria.map((exit, i) => (
              <div key={i} className="flex gap-2 items-start p-3 border rounded-lg">
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Signal (e.g., prospect_agrees)"
                    value={exit.signal}
                    onChange={(e) => {
                      const newExits = [...editingStep.exitCriteria];
                      newExits[i] = { ...exit, signal: e.target.value };
                      setEditingStep({ ...editingStep, exitCriteria: newExits });
                    }}
                  />
                  <Input
                    placeholder="Description"
                    value={exit.description}
                    onChange={(e) => {
                      const newExits = [...editingStep.exitCriteria];
                      newExits[i] = { ...exit, description: e.target.value };
                      setEditingStep({ ...editingStep, exitCriteria: newExits });
                    }}
                  />
                  <Input
                    placeholder="Next Step ID (optional)"
                    value={exit.nextStep || ''}
                    onChange={(e) => {
                      const newExits = [...editingStep.exitCriteria];
                      newExits[i] = { ...exit, nextStep: e.target.value || undefined };
                      setEditingStep({ ...editingStep, exitCriteria: newExits });
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newExits = editingStep.exitCriteria.filter((_, idx) => idx !== i);
                    setEditingStep({ ...editingStep, exitCriteria: newExits });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Fallback */}
          <div className="space-y-4">
            <h4 className="font-medium">Fallback Action</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={editingStep.fallback?.action || 'proceed'}
                  onValueChange={(val) => setEditingStep({
                    ...editingStep,
                    fallback: { ...editingStep.fallback, action: val },
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FALLBACK_ACTIONS.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max Attempts</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={editingStep.fallback?.maxAttempts || 2}
                  onChange={(e) => setEditingStep({
                    ...editingStep,
                    fallback: { ...editingStep.fallback, action: editingStep.fallback?.action || 'proceed', maxAttempts: parseInt(e.target.value) || 2 },
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Input
                  value={editingStep.fallback?.message || ''}
                  onChange={(e) => setEditingStep({
                    ...editingStep,
                    fallback: { ...editingStep.fallback, action: editingStep.fallback?.action || 'proceed', message: e.target.value },
                  })}
                  placeholder="Optional message"
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  };

  // Render flow editor content
  const renderFlowEditor = () => {
    if (!editingFlow) return null;

    return (
      <div className="space-y-6">
        {/* Flow Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Flow Name</Label>
            <Input
              value={editingFlow.name}
              onChange={(e) => setEditingFlow({ ...editingFlow, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Total Turns</Label>
            <Input
              type="number"
              min={5}
              max={50}
              value={editingFlow.maxTotalTurns}
              onChange={(e) => setEditingFlow({ ...editingFlow, maxTotalTurns: parseInt(e.target.value) || 20 })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Objective</Label>
          <Textarea
            value={editingFlow.objective}
            onChange={(e) => setEditingFlow({ ...editingFlow, objective: e.target.value })}
            placeholder="What is the main goal of this call flow?"
          />
        </div>
        <div className="space-y-2">
          <Label>Success Criteria</Label>
          <Textarea
            value={editingFlow.successCriteria}
            onChange={(e) => setEditingFlow({ ...editingFlow, successCriteria: e.target.value })}
            placeholder="How do we know this call was successful?"
          />
        </div>

        <Separator />

        {/* Steps List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Call Flow Steps ({editingFlow.steps.length})</h4>
            <Button variant="outline" size="sm" onClick={() => addStep()}>
              <Plus className="h-4 w-4 mr-1" />
              Add Step
            </Button>
          </div>

          <div className="space-y-2">
            {editingFlow.steps.map((step, index) => (
              <div
                key={step.stepId}
                className="flex items-center gap-2 p-3 border rounded-lg bg-background hover:bg-accent/5 transition-colors"
              >
                {/* Reorder controls */}
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveStepUp(index)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === editingFlow.steps.length - 1}
                    onClick={() => moveStepDown(index)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Step info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`${STATE_COLORS[step.mappedState]?.bg || ''} ${STATE_COLORS[step.mappedState]?.text || ''}`}
                    >
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{step.name}</span>
                    <span className="text-xs text-muted-foreground">({step.mappedState})</span>
                  </div>
                  {step.goal && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{step.goal}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openStepEditor(step, index)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => addStep(index)}
                    title="Add step after"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStep(index)}
                    disabled={editingFlow.steps.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <SettingsLayout
      title="Call Flow Management"
      description="Configure and assign pre-set call flows for different campaign types. These flows control the AI agent's conversation structure."
    >
      <Tabs defaultValue="mappings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="mappings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Campaign Type Mappings
          </TabsTrigger>
          <TabsTrigger value="flows" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Available Call Flows
          </TabsTrigger>
        </TabsList>

        {/* Campaign Type Mappings Tab */}
        <TabsContent value="mappings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Type to Call Flow Assignments</CardTitle>
              <CardDescription>
                Each campaign type uses a specific call flow. Assign the appropriate flow for each type.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mappingsLoading || flowsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {CAMPAIGN_TYPES.map((type) => {
                    const flow = getFlowForCampaignType(type.id);
                    const Icon = type.icon;
                    return (
                      <div
                        key={type.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium">{type.name}</h3>
                            <p className="text-sm text-muted-foreground">{type.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {flow ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                {flow.name}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {flow.steps.length} steps
                              </span>
                            </div>
                          ) : (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              No flow assigned
                            </Badge>
                          )}
                          <div className="flex gap-2">
                            {flow && (
                              <Button variant="ghost" size="sm" onClick={() => handleViewFlow(flow)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => handleAssignFlow(type.id)}>
                              <Edit className="h-4 w-4 mr-1" />
                              Assign
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Available Call Flows Tab */}
        <TabsContent value="flows" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pre-Set Call Flows</CardTitle>
                  <CardDescription>
                    View and manage the available call flow templates. Create custom flows or duplicate system flows to customize.
                  </CardDescription>
                </div>
                <Button onClick={handleCreateNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Flow
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {flowsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {callFlows.map((flow) => (
                    <Card key={flow.id} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {flow.name}
                              {flow.isSystemFlow ? (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  <Lock className="h-3 w-3" />
                                  System
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                  <Unlock className="h-3 w-3" />
                                  Custom
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {flow.objective}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              <span>{flow.steps.length} steps</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <RotateCcw className="h-4 w-4 text-muted-foreground" />
                              <span>Max {flow.maxTotalTurns} turns</span>
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground">
                            <strong>Success:</strong> {flow.successCriteria}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {flow.steps.slice(0, 4).map((step, i) => (
                              <Badge
                                key={step.stepId}
                                variant="outline"
                                className={`text-xs ${STATE_COLORS[step.mappedState]?.bg || ''} ${STATE_COLORS[step.mappedState]?.text || ''}`}
                              >
                                {i + 1}. {step.name}
                              </Badge>
                            ))}
                            {flow.steps.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{flow.steps.length - 4} more
                              </Badge>
                            )}
                          </div>

                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleViewFlow(flow)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleEditFlow(flow)}
                              disabled={duplicateFlowMutation.isPending}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              {flow.isSystemFlow ? 'Edit Copy' : 'Edit'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDuplicateFlow(flow)}
                              disabled={duplicateFlowMutation.isPending}
                              title="Create a duplicate copy"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {!flow.isSystemFlow && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteFlow(flow)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Call Flow Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              {selectedFlow?.name}
              {selectedFlow?.isSystemFlow && (
                <Badge variant="secondary" className="text-xs">System</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedFlow?.objective}
            </DialogDescription>
          </DialogHeader>

          {selectedFlow && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm">
                      <Label className="text-muted-foreground">Success Criteria</Label>
                      <p className="mt-1 font-medium">{selectedFlow.successCriteria}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex justify-around text-center">
                      <div>
                        <p className="text-2xl font-bold">{selectedFlow.steps.length}</p>
                        <p className="text-xs text-muted-foreground">Steps</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{selectedFlow.maxTotalTurns}</p>
                        <p className="text-xs text-muted-foreground">Max Turns</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Call Flow Steps</h3>
                <Accordion type="single" collapsible className="space-y-2">
                  {selectedFlow.steps.map((step, index) => (
                    <AccordionItem key={step.stepId} value={step.stepId} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className={`${STATE_COLORS[step.mappedState]?.bg || ''} ${STATE_COLORS[step.mappedState]?.text || ''}`}
                          >
                            Step {index + 1}
                          </Badge>
                          <span className="font-medium">{step.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({step.mappedState})
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4 pt-2">
                          <div>
                            <Label className="text-muted-foreground text-xs">Goal</Label>
                            <p className="text-sm mt-1">{step.goal}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-muted-foreground text-xs">Allowed Intents</Label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {step.allowedIntents.map((intent) => (
                                  <Badge key={intent} variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                                    {intent}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {step.forbiddenIntents && step.forbiddenIntents.length > 0 && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Forbidden Intents</Label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {step.forbiddenIntents.map((intent) => (
                                    <Badge key={intent} variant="outline" className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                                      {intent}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <Label className="text-muted-foreground text-xs">Max Questions</Label>
                              <p className="font-medium">{step.allowedQuestions}</p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground text-xs">Max Turns in Step</Label>
                              <p className="font-medium">{step.maxTurnsInStep}</p>
                            </div>
                          </div>

                          {step.mustDo && step.mustDo.length > 0 && (
                            <div>
                              <Label className="text-muted-foreground text-xs">Must Do</Label>
                              <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                                {step.mustDo.map((item, i) => (
                                  <li key={i} className="text-green-700 dark:text-green-300">{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {step.mustNotDo && step.mustNotDo.length > 0 && (
                            <div>
                              <Label className="text-muted-foreground text-xs">Must Not Do</Label>
                              <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                                {step.mustNotDo.map((item, i) => (
                                  <li key={i} className="text-red-700 dark:text-red-300">{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div>
                            <Label className="text-muted-foreground text-xs">Exit Criteria</Label>
                            <div className="space-y-1 mt-1">
                              {step.exitCriteria.map((exit, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                  <span>{exit.description}</span>
                                  {exit.nextStep && (
                                    <Badge variant="outline" className="text-xs">
                                      → {exit.nextStep}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {step.branches && step.branches.length > 0 && (
                            <div>
                              <Label className="text-muted-foreground text-xs">Branches</Label>
                              <div className="space-y-1 mt-1">
                                {step.branches.map((branch, i) => (
                                  <div key={i} className="text-sm p-2 bg-muted/50 rounded">
                                    <strong>{branch.trigger}:</strong> {branch.description}
                                    {branch.targetStep && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        → {branch.targetStep}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => selectedFlow && handleDuplicateFlow(selectedFlow)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Call Flow Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Call Flow
            </DialogTitle>
            <DialogDescription>
              Create a new custom call flow. Configure the flow details and add steps.
            </DialogDescription>
          </DialogHeader>

          {renderFlowEditor()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveNewFlow}
              disabled={createFlowMutation.isPending || !editingFlow?.name || !editingFlow?.objective}
            >
              <Save className="h-4 w-4 mr-2" />
              {createFlowMutation.isPending ? 'Creating...' : 'Create Flow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Call Flow Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Call Flow
            </DialogTitle>
            <DialogDescription>
              Modify the call flow configuration, add or remove steps, and reorder them.
            </DialogDescription>
          </DialogHeader>

          {renderFlowEditor()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditedFlow}
              disabled={updateFlowMutation.isPending || !editingFlow?.name || !editingFlow?.objective}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateFlowMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Edit Dialog */}
      <Dialog open={stepEditDialogOpen} onOpenChange={setStepEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Step: {editingStep?.name}
            </DialogTitle>
            <DialogDescription>
              Configure the step's behavior, intents, rules, and exit criteria.
            </DialogDescription>
          </DialogHeader>

          {renderStepEditor()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStepEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveStepChanges}>
              <Save className="h-4 w-4 mr-2" />
              Save Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Call Flow Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Call Flow</DialogTitle>
            <DialogDescription>
              Select which call flow to use for {CAMPAIGN_TYPES.find(t => t.id === selectedCampaignType)?.name || selectedCampaignType} campaigns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Call Flow</Label>
              <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a call flow..." />
                </SelectTrigger>
                <SelectContent>
                  {callFlows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>
                      <div className="flex items-center gap-2">
                        <span>{flow.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({flow.steps.length} steps)
                        </span>
                        {flow.isSystemFlow && (
                          <Badge variant="secondary" className="text-xs">System</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedFlowId && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="font-medium">
                  {callFlows.find(f => f.id === selectedFlowId)?.name}
                </p>
                <p className="text-muted-foreground mt-1">
                  {callFlows.find(f => f.id === selectedFlowId)?.objective}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveMapping}
              disabled={!selectedFlowId || updateMappingMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMappingMutation.isPending ? 'Saving...' : 'Save Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Call Flow?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedFlow?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedFlow && deleteFlowMutation.mutate(selectedFlow.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFlowMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
