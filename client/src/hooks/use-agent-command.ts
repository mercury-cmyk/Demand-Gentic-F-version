/**
 * Agent Command Center - React Hooks
 * 
 * Custom hooks for:
 * - SSE event streaming
 * - Run state management
 * - Interrupt handling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AgentCommandRun,
  AgentCommandStep,
  AgentCommandInterrupt,
  AgentCommandArtifact,
  AgentEventEnvelope,
  CreateAgentRunRequest,
  InterruptResponse,
} from '@shared/agent-command-center-schema';

// ============================================================================
// API CLIENT
// ============================================================================

async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`/api/agent${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }
  
  return response.json();
}

// ============================================================================
// SSE HOOK
// ============================================================================

interface UseSSEOptions {
  onEvent?: (event: AgentEventEnvelope) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export function useAgentSSE(runId: string | null, options: UseSSEOptions = {}) {
  const { onEvent, onError, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSeqRef = useRef<number>(0);
  
  useEffect(() => {
    if (!runId || !enabled) {
      return;
    }
    
    const url = `/api/agent/runs/${runId}/events${lastSeqRef.current ? `?cursor=${lastSeqRef.current}` : ''}`;
    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      setConnected(true);
    };
    
    eventSource.onerror = (err) => {
      setConnected(false);
      onError?.(new Error('SSE connection error'));
    };
    
    // Listen for all event types
    const eventTypes = [
      'run.created', 'run.started', 'run.phase.changed', 'run.progress',
      'run.completed', 'run.failed', 'run.cancelled', 'run.heartbeat',
      'plan.created', 'step.created', 'step.started', 'step.completed', 'step.failed',
      'tool.called', 'tool.result', 'output.upserted', 'source.attached',
      'approval.requested', 'approval.resolved',
      'interrupt.raised', 'interrupt.submitted', 'interrupt.expired',
    ];
    
    eventTypes.forEach(type => {
      eventSource.addEventListener(type, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as AgentEventEnvelope;
          lastSeqRef.current = Math.max(lastSeqRef.current, event.seq);
          onEvent?.(event);
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      });
    });
    
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [runId, enabled, onEvent, onError]);
  
  return { connected };
}

// ============================================================================
// RUN STATE HOOK
// ============================================================================

export interface RunState {
  run: AgentCommandRun | null;
  steps: AgentCommandStep[];
  artifacts: AgentCommandArtifact[];
  pendingInterrupt: AgentCommandInterrupt | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAgentRun(runId: string | null) {
  const queryClient = useQueryClient();
  
  const [localState, setLocalState] = useState<{
    steps: AgentCommandStep[];
    artifacts: AgentCommandArtifact[];
    pendingInterrupt: AgentCommandInterrupt | null;
  }>({
    steps: [],
    artifacts: [],
    pendingInterrupt: null,
  });
  
  // Fetch initial run data
  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-run', runId],
    queryFn: () => apiRequest<{
      run: AgentCommandRun;
      steps: AgentCommandStep[];
      artifacts: AgentCommandArtifact[];
      pendingInterrupt: AgentCommandInterrupt | null;
    }>(`/runs/${runId}`),
    enabled: !!runId,
    refetchOnWindowFocus: false,
  });
  
  // Initialize local state from query
  useEffect(() => {
    if (data) {
      setLocalState({
        steps: data.steps,
        artifacts: data.artifacts,
        pendingInterrupt: data.pendingInterrupt,
      });
    }
  }, [data]);
  
  // Handle SSE events
  const handleEvent = useCallback((event: AgentEventEnvelope) => {
    // Update run in cache
    queryClient.setQueryData(['agent-run', runId], (old: any) => {
      if (!old) return old;
      
      let updatedRun = { ...old.run };
      
      switch (event.type) {
        case 'run.started':
          updatedRun.status = 'running';
          updatedRun.startedAt = event.ts;
          break;
        case 'run.phase.changed':
          updatedRun.phase = (event.data as any).to;
          break;
        case 'run.progress':
          updatedRun.currentStepIdx = (event.data as any).currentStep;
          updatedRun.totalSteps = (event.data as any).totalSteps;
          break;
        case 'run.completed':
          updatedRun.status = 'completed';
          updatedRun.completedAt = event.ts;
          updatedRun.summaryMd = (event.data as any).summary;
          break;
        case 'run.failed':
          updatedRun.status = 'failed';
          updatedRun.errorMessage = (event.data as any).errorMessage;
          break;
        case 'run.cancelled':
          updatedRun.status = 'cancelled';
          break;
      }
      
      return { ...old, run: updatedRun };
    });
    
    // Update local state for steps/artifacts/interrupts
    setLocalState(prev => {
      const newState = { ...prev };
      
      switch (event.type) {
        case 'step.created':
        case 'step.started':
        case 'step.completed':
        case 'step.failed': {
          const stepData = event.data as any;
          const existingIdx = newState.steps.findIndex(s => s.id === stepData.stepId);
          
          if (existingIdx >= 0) {
            newState.steps = [...newState.steps];
            newState.steps[existingIdx] = {
              ...newState.steps[existingIdx],
              status: event.type === 'step.started' ? 'running' :
                      event.type === 'step.completed' ? 'done' :
                      event.type === 'step.failed' ? 'failed' :
                      newState.steps[existingIdx].status,
              resultSummary: stepData.resultSummary,
              errorMessage: stepData.errorMessage,
            };
          } else if (event.type === 'step.created' || event.type === 'step.started') {
            newState.steps = [...newState.steps, {
              id: stepData.stepId,
              runId: event.runId,
              idx: stepData.idx ?? newState.steps.length,
              title: stepData.title,
              why: stepData.why,
              status: event.type === 'step.started' ? 'running' : 'queued',
              toolName: null,
              toolArgsRedacted: null,
              resultSummary: null,
              errorMessage: null,
              retryCount: 0,
              startedAt: event.type === 'step.started' ? new Date(event.ts) : null,
              finishedAt: null,
              createdAt: new Date(event.ts),
            }];
          }
          break;
        }
        
        case 'output.upserted': {
          const artifactData = event.data as any;
          newState.artifacts = [
            ...newState.artifacts.filter(a => a.id !== artifactData.artifactId),
            {
              id: artifactData.artifactId,
              runId: event.runId,
              stepId: event.stepId ?? null,
              kind: artifactData.kind,
              title: artifactData.title,
              url: artifactData.url,
              refId: artifactData.refId ?? null,
              contentJson: null,
              createdAt: new Date(event.ts),
            },
          ];
          break;
        }
        
        case 'interrupt.raised': {
          const interruptData = event.data as any;
          newState.pendingInterrupt = {
            id: interruptData.interruptId,
            runId: event.runId,
            stepId: event.stepId ?? null,
            interruptType: interruptData.interruptType,
            state: 'pending',
            title: interruptData.title,
            whyNeeded: interruptData.whyNeeded,
            resumeHint: interruptData.resumeHint,
            schemaVersion: 1,
            questions: interruptData.questions,
            defaults: interruptData.defaults,
            blocking: interruptData.blocking,
            timeoutSeconds: null,
            response: null,
            respondedAt: null,
            respondedByUserId: null,
            createdAt: new Date(event.ts),
            expiresAt: null,
          };
          break;
        }
        
        case 'interrupt.submitted':
          newState.pendingInterrupt = null;
          break;
      }
      
      return newState;
    });
  }, [queryClient, runId]);
  
  // Connect to SSE
  const { connected } = useAgentSSE(runId, {
    onEvent: handleEvent,
    enabled: !!runId && data?.run?.status !== 'completed' && data?.run?.status !== 'failed' && data?.run?.status !== 'cancelled',
  });
  
  return {
    run: data?.run ?? null,
    steps: localState.steps,
    artifacts: localState.artifacts,
    pendingInterrupt: localState.pendingInterrupt,
    isLoading,
    error: error as Error | null,
    connected,
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useCreateRun() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: CreateAgentRunRequest) =>
      apiRequest<{ runId: string; sseUrl: string }>('/runs', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-runs'] });
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (runId: string) =>
      apiRequest<{ success: boolean }>(`/runs/${runId}/cancel`, {
        method: 'POST',
      }),
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: ['agent-run', runId] });
    },
  });
}

export function useSubmitInterruptResponse() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({
      runId,
      interruptId,
      response,
    }: {
      runId: string;
      interruptId: string;
      response: InterruptResponse;
    }) =>
      apiRequest<{ success: boolean }>(`/runs/${runId}/interrupts/${interruptId}`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      }),
    onSuccess: (_, { runId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-run', runId] });
    },
  });
}

export function useListRuns(options?: { limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['agent-runs', options],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.status) params.set('status', options.status);
      
      return apiRequest<{
        runs: Array<{
          id: string;
          request: string;
          status: string;
          phase: string;
          createdAt: string;
          completedAt: string | null;
          summary: string | null;
          outputCount: number;
        }>;
      }>(`/runs?${params.toString()}`);
    },
  });
}
