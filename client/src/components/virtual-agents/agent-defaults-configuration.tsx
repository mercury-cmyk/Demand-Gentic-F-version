/**
 * Global Agent Defaults Configuration Component
 * 
 * Allows administrators to manage centralized default settings for all virtual agents.
 * These defaults are automatically inherited by new agents unless overridden.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, RotateCcw, Settings, Info, CheckCircle2, AlertCircle, PhoneCall } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AgentDefaults {
  id: string | null;
  defaultFirstMessage: string;
  defaultSystemPrompt: string;
  defaultTrainingGuidelines: string[];
  defaultVoiceProvider: string;
  defaultVoice: string;
  defaultMaxConcurrentCalls: number;
  globalMaxConcurrentCalls: number;
  isSystemDefault: boolean;
  updatedAt: string | null;
}

export function AgentDefaultsConfiguration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstMessage, setFirstMessage] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [trainingGuidelines, setTrainingGuidelines] = useState<string[]>([]);
  const [voiceProvider, setVoiceProvider] = useState('google');
  const [voice, setVoice] = useState('Kore');
  const [defaultMaxConcurrentCalls, setDefaultMaxConcurrentCalls] = useState(100);
  const [globalMaxConcurrentCalls, setGlobalMaxConcurrentCalls] = useState(100);
  const [newGuideline, setNewGuideline] = useState('');

  // Fetch current defaults
  const { data: defaults, isLoading } = useQuery<AgentDefaults>({
    queryKey: ['/api/agent-defaults'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/agent-defaults');
      return res.json();
    },
  });

  // Populate form when defaults are loaded
  useEffect(() => {
    if (defaults) {
      setFirstMessage(defaults.defaultFirstMessage);
      setSystemPrompt(defaults.defaultSystemPrompt);
      setTrainingGuidelines(defaults.defaultTrainingGuidelines);
      setVoiceProvider(defaults.defaultVoiceProvider);
      setVoice(defaults.defaultVoice);
      setDefaultMaxConcurrentCalls(defaults.defaultMaxConcurrentCalls ?? 100);
      setGlobalMaxConcurrentCalls(defaults.globalMaxConcurrentCalls ?? 100);
    }
  }, [defaults]);

  // Update defaults mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', '/api/agent-defaults', {
        defaultFirstMessage: firstMessage,
        defaultSystemPrompt: systemPrompt,
        defaultTrainingGuidelines: trainingGuidelines,
        defaultVoiceProvider: voiceProvider,
        defaultVoice: voice,
        defaultMaxConcurrentCalls,
        globalMaxConcurrentCalls,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-defaults'] });
      toast({
        title: 'Defaults updated',
        description: 'Global agent defaults have been saved successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reset to system defaults mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/agent-defaults/reset', {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-defaults'] });
      setFirstMessage(data.defaultFirstMessage);
      setSystemPrompt(data.defaultSystemPrompt);
      setTrainingGuidelines(data.defaultTrainingGuidelines);
      setVoiceProvider(data.defaultVoiceProvider);
      setVoice(data.defaultVoice);
      setDefaultMaxConcurrentCalls(data.defaultMaxConcurrentCalls ?? 100);
      setGlobalMaxConcurrentCalls(data.globalMaxConcurrentCalls ?? 100);
      toast({
        title: 'Reset complete',
        description: 'Global agent defaults have been reset to system defaults.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Reset failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addGuideline = () => {
    if (newGuideline.trim()) {
      setTrainingGuidelines([...trainingGuidelines, newGuideline.trim()]);
      setNewGuideline('');
    }
  };

  const removeGuideline = (index: number) => {
    setTrainingGuidelines(trainingGuidelines.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Global Agent Defaults
              </CardTitle>
              <CardDescription>
                Define baseline settings that all virtual agents inherit automatically
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {defaults?.isSystemDefault && (
                <Badge variant="outline" className="text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  System Defaults
                </Badge>
              )}
              {defaults && !defaults.isSystemDefault && defaults.updatedAt && (
                <Badge variant="secondary">
                  Last updated: {new Date(defaults.updatedAt).toLocaleDateString()}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-950/20">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                How Defaults Work
              </p>
              <p className="text-xs text-muted-foreground">
                These settings are automatically applied to all new agents. Individual agents can override
                these defaults if needed. Changes here affect all future agents but do not modify existing agents.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Opening Message */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Opening Message</CardTitle>
          <CardDescription>
            The first message agents use when starting a conversation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstMessage">Opening Message Template</Label>
            <Textarea
              id="firstMessage"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Hi, may I speak with {{contact.full_name}}..."
              rows={3}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use template variables: <code className="bg-muted px-1 py-0.5 rounded">{'{{contact.full_name}}'}</code>,{' '}
              <code className="bg-muted px-1 py-0.5 rounded">{'{{contact.job_title}}'}</code>,{' '}
              <code className="bg-muted px-1 py-0.5 rounded">{'{{account.name}}'}</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Default System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default System Prompt Structure</CardTitle>
          <CardDescription>
            The foundational prompt that defines how agents think and behave
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="# Personality\n\nYou are a professional..."
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This prompt defines the agent's personality, environment, tone, and behavioral framework.
              It is applied to all agents automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Training Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Training Guidelines</CardTitle>
          <CardDescription>
            Behavioral constraints and best practices applied to all agents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {trainingGuidelines.map((guideline, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-lg border p-3 bg-muted/50"
              >
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm flex-1">{guideline}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGuideline(index)}
                  className="h-6 w-6 p-0"
                >
                  ×
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={newGuideline}
              onChange={(e) => setNewGuideline(e.target.value)}
              placeholder="Add a new training guideline..."
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGuideline();
                }
              }}
            />
            <Button type="button" onClick={addGuideline} variant="outline">
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Default Voice Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Voice Configuration</CardTitle>
          <CardDescription>
            Default voice provider and voice selection for new agents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="voiceProvider">Voice Provider</Label>
              <Select value={voiceProvider} onValueChange={setVoiceProvider}>
                <SelectTrigger id="voiceProvider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Gemini (Recommended)</SelectItem>
                  <SelectItem value="openai">OpenAI Realtime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice">Default Voice</Label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger id="voice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voiceProvider === 'google' ? (
                    <>
                      <SelectItem value="Puck">Puck - Upbeat & energetic</SelectItem>
                      <SelectItem value="Kore">Kore - Soft & friendly (Recommended)</SelectItem>
                      <SelectItem value="Charon">Charon - Deep & authoritative</SelectItem>
                      <SelectItem value="Fenrir">Fenrir - Calm & measured</SelectItem>
                      <SelectItem value="Aoede">Aoede - Bright & energetic</SelectItem>
                      <SelectItem value="Leda">Leda - Professional & articulate</SelectItem>
                      <SelectItem value="Orus">Orus - Warm & conversational</SelectItem>
                      <SelectItem value="Zephyr">Zephyr - Light & modern</SelectItem>
                      <SelectItem value="Pegasus">Pegasus - Calm & professional</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="ash">Ash - Clear & professional</SelectItem>
                      <SelectItem value="verse">Verse - Poetic & dynamic</SelectItem>
                      <SelectItem value="ballad">Ballad - Warm & storytelling</SelectItem>
                      <SelectItem value="echo">Echo - Deep & resonant</SelectItem>
                      <SelectItem value="coral">Coral - Warm & friendly</SelectItem>
                      <SelectItem value="sage">Sage - Calm & wise</SelectItem>
                      <SelectItem value="shimmer">Shimmer - Expressive & clear</SelectItem>
                      <SelectItem value="marin">Marin - Calm & professional</SelectItem>
                      <SelectItem value="alloy">Alloy - Neutral & balanced</SelectItem>
                      <SelectItem value="nova">Nova - Friendly & upbeat</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Concurrent Call Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            Concurrent Call Limits
          </CardTitle>
          <CardDescription>
            Control how many simultaneous calls can run per campaign and system-wide
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="defaultMaxConcurrent">Per-Campaign Default</Label>
              <Input
                id="defaultMaxConcurrent"
                type="number"
                min={1}
                max={500}
                value={defaultMaxConcurrentCalls}
                onChange={(e) => setDefaultMaxConcurrentCalls(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground">
                Maximum concurrent calls each campaign can make unless overridden in campaign settings.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="globalMaxConcurrent">System-Wide Maximum</Label>
              <Input
                id="globalMaxConcurrent"
                type="number"
                min={1}
                max={1000}
                value={globalMaxConcurrentCalls}
                onChange={(e) => setGlobalMaxConcurrentCalls(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground">
                Total concurrent calls across all campaigns combined (Telnyx capacity limit).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border p-3 bg-amber-50/50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Setting these too high may exceed your telephony provider's capacity. The system-wide max
              caps the total across all active campaigns, while per-campaign default limits each campaign individually.
              Individual campaigns can override the per-campaign default in their AI settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={resetMutation.isPending}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to System Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to System Defaults?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restore all settings to the original system defaults. Any custom
                    configurations you've made will be lost. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset to Defaults
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Global Defaults
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
