/**
 * useCampaignRunner Hook
 * 
 * React hook for running AI campaigns via browser WebRTC.
 * Connects to server via WebSocket, receives tasks, makes calls.
 * 
 * All calls are made through Telnyx WebRTC + OpenAI Realtime WebRTC.
 * NO server-side REST API calls.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUnifiedWebRTC, type CallTranscript } from './useUnifiedWebRTC';

export type CampaignRunnerStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'running'
  | 'paused'
  | 'error';

export interface CampaignTask {
  taskId: string;
  campaignId: string;
  queueItemId: string;
  contactId: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  phoneNumber: string;
  companyName: string | null;
  accountId: string | null;
  aiSettings: {
    persona: {
      name: string;
      companyName: string;
      systemPrompt: string;
      voice: string;
    };
    objective: {
      type: string;
      qualificationQuestions: string[];
      meetingLink?: string;
    };
    handoff: {
      enabled: boolean;
      transferNumber?: string;
      handoffTriggers: string[];
    };
    callRecording: {
      enabled: boolean;
    };
  };
  fromNumber: string;
  agentName: string;
  agentFullName: string;
}

export interface CampaignRunnerStats {
  totalCallsMade: number;
  successfulCalls: number;
  failedCalls: number;
  averageCallDuration: number;
  currentTask: CampaignTask | null;
}

export interface CampaignRunnerConfig {
  // WebSocket URL for campaign runner
  wsUrl?: string;
  // User info
  userId: string;
  username: string;
  // Campaigns to run
  campaignIds: string[];
  // Max concurrent calls (usually 1 for browser)
  maxConcurrent?: number;
  // Telnyx credentials
  telnyxCredentials: {
    username?: string;
    password?: string;
    token?: string;
  };
  // OpenAI endpoint
  openaiEphemeralEndpoint: string;
  // Caller ID
  callerIdNumber?: string;
  callerIdName?: string;
  // Callbacks
  onTaskStarted?: (task: CampaignTask) => void;
  onTaskCompleted?: (task: CampaignTask, disposition: string) => void;
  onTaskFailed?: (task: CampaignTask, error: string) => void;
  onCampaignComplete?: (campaignId: string) => void;
  onError?: (error: Error) => void;
}

export interface CampaignRunnerState {
  status: CampaignRunnerStatus;
  isRunning: boolean;
  isPaused: boolean;
  currentTask: CampaignTask | null;
  stats: CampaignRunnerStats;
  error: Error | null;
  stallReason: string | null;
  transcripts: CallTranscript[];
  callDurationSeconds: number;
}

export interface CampaignRunnerActions {
  connect: () => void;
  disconnect: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipCurrentCall: () => void;
}

export function useCampaignRunner(config: CampaignRunnerConfig): [CampaignRunnerState, CampaignRunnerActions] {
  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);

  // State
  const [status, setStatus] = useState<CampaignRunnerStatus>('disconnected');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTask, setCurrentTask] = useState<CampaignTask | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stallReason, setStallReason] = useState<string | null>(null);
  const [stats, setStats] = useState<CampaignRunnerStats>({
    totalCallsMade: 0,
    successfulCalls: 0,
    failedCalls: 0,
    averageCallDuration: 0,
    currentTask: null,
  });

  // Use unified WebRTC for actual calls
  const [webrtcState, webrtcActions] = useUnifiedWebRTC({
    telnyxCredentials: config.telnyxCredentials,
    callerIdNumber: config.callerIdNumber,
    callerIdName: config.callerIdName,
    openaiEphemeralEndpoint: config.openaiEphemeralEndpoint,
    enableAIMonitoring: true,
  });

  // Build AI instructions from current task
  const getAIInstructions = useCallback((task: CampaignTask): string => {
    const { aiSettings, contactFirstName, contactLastName, companyName, contactTitle } = task;
    const contactName = [contactFirstName, contactLastName].filter(Boolean).join(' ');
    
    let instructions = aiSettings.persona.systemPrompt || '';
    
    // Add contact context
    instructions += `\n\nYou are calling ${contactName || 'a prospect'}`;
    if (contactTitle) instructions += `, who is a ${contactTitle}`;
    if (companyName) instructions += ` at ${companyName}`;
    instructions += '.';

    // Add qualification questions
    if (aiSettings.objective.qualificationQuestions?.length) {
      instructions += '\n\nKey questions to ask:\n';
      aiSettings.objective.qualificationQuestions.forEach((q, i) => {
        instructions += `${i + 1}. ${q}\n`;
      });
    }

    // Add meeting booking info
    if (aiSettings.objective.meetingLink) {
      instructions += `\n\nIf the prospect is interested, offer to book a meeting. Use this link: ${aiSettings.objective.meetingLink}`;
    }

    // Add handoff triggers
    if (aiSettings.handoff.enabled && aiSettings.handoff.handoffTriggers?.length) {
      instructions += '\n\nTransfer to a human agent if any of these happen:\n';
      aiSettings.handoff.handoffTriggers.forEach(t => {
        instructions += `- ${t}\n`;
      });
    }

    return instructions;
  }, []);

  // Process a call task
  const processTask = useCallback(async (task: CampaignTask) => {
    if (!webrtcState.isReady) {
      console.error('[CampaignRunner] WebRTC not ready');
      return;
    }

    console.log(`[CampaignRunner] Processing task: ${task.taskId} - calling ${task.phoneNumber}`);
    setCurrentTask(task);
    callStartTimeRef.current = new Date();

    // Notify server task started
    wsRef.current?.send(JSON.stringify({
      type: 'task_started',
      taskId: task.taskId,
    }));

    config.onTaskStarted?.(task);

    try {
      // Update AI instructions for this contact
      const instructions = getAIInstructions(task);
      webrtcActions.updateAIInstructions(instructions);

      // Switch to AI mode
      await webrtcActions.switchToAI();

      // Make the call
      await webrtcActions.makeCall(task.phoneNumber, {
        callerIdNumber: task.fromNumber || config.callerIdNumber,
        callerIdName: task.agentName,
      });

    } catch (err) {
      console.error('[CampaignRunner] Call failed:', err);
      handleTaskFailed(task, err instanceof Error ? err.message : 'Unknown error');
    }
  }, [webrtcState.isReady, webrtcActions, config, getAIInstructions]);

  // Handle call ended
  useEffect(() => {
    if (currentTask && webrtcState.callState === 'hangup') {
      // Calculate duration
      const duration = callStartTimeRef.current 
        ? Math.floor((Date.now() - callStartTimeRef.current.getTime()) / 1000)
        : 0;

      // Determine disposition from transcripts
      const disposition = determineDisposition(webrtcState.transcripts);

      // Report completion
      handleTaskCompleted(currentTask, disposition, duration, webrtcState.transcripts);
    }
  }, [webrtcState.callState, currentTask]);

  // Determine disposition from transcript
  const determineDisposition = (transcripts: CallTranscript[]): string => {
    const allText = transcripts.map(t => t.text.toLowerCase()).join(' ');
    
    if (allText.includes('voicemail') || allText.includes('leave a message')) {
      return 'voicemail';
    }
    if (allText.includes('not interested') || allText.includes('no thank you')) {
      return 'not_interested';
    }
    if (allText.includes('meeting') || allText.includes('calendar') || allText.includes('schedule')) {
      return 'meeting_booked';
    }
    if (allText.includes('callback') || allText.includes('call back')) {
      return 'callback_requested';
    }
    if (transcripts.length < 3) {
      return 'no_answer';
    }
    return 'completed';
  };

  // Handle task completed
  const handleTaskCompleted = useCallback((
    task: CampaignTask,
    disposition: string,
    durationSeconds: number,
    transcripts: CallTranscript[]
  ) => {
    console.log(`[CampaignRunner] Task completed: ${task.taskId} - ${disposition}`);

    // Update stats
    setStats(prev => ({
      ...prev,
      totalCallsMade: prev.totalCallsMade + 1,
      successfulCalls: prev.successfulCalls + 1,
      averageCallDuration: Math.round(
        (prev.averageCallDuration * prev.totalCallsMade + durationSeconds) / (prev.totalCallsMade + 1)
      ),
      currentTask: null,
    }));

    // Notify server
    wsRef.current?.send(JSON.stringify({
      type: 'task_completed',
      taskId: task.taskId,
      disposition,
      callDurationSeconds: durationSeconds,
      transcript: transcripts.map(t => ({ role: t.role, text: t.text })),
    }));

    config.onTaskCompleted?.(task, disposition);
    setCurrentTask(null);
    callStartTimeRef.current = null;

    // Request next task if still running
    if (isRunning && !isPaused) {
      requestNextTask();
    }
  }, [isRunning, isPaused, config]);

  // Handle task failed
  const handleTaskFailed = useCallback((task: CampaignTask, errorMsg: string) => {
    console.error(`[CampaignRunner] Task failed: ${task.taskId} - ${errorMsg}`);

    setStats(prev => ({
      ...prev,
      totalCallsMade: prev.totalCallsMade + 1,
      failedCalls: prev.failedCalls + 1,
      currentTask: null,
    }));

    wsRef.current?.send(JSON.stringify({
      type: 'task_failed',
      taskId: task.taskId,
      error: errorMsg,
    }));

    config.onTaskFailed?.(task, errorMsg);
    setCurrentTask(null);
    callStartTimeRef.current = null;

    // Request next task if still running
    if (isRunning && !isPaused) {
      setTimeout(() => requestNextTask(), 2000); // Small delay after failure
    }
  }, [isRunning, isPaused, config]);

  // Request next task from server
  const requestNextTask = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'request_task' }));
  }, []);

  // Connect to server
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);

    const wsUrl = config.wsUrl || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/campaign-runner`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[CampaignRunner] WebSocket connected');
      
      // Register with server
      ws.send(JSON.stringify({
        type: 'register',
        userId: config.userId,
        username: config.username,
        campaignIds: config.campaignIds,
        maxConcurrent: config.maxConcurrent || 1,
      }));

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 10000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('[CampaignRunner] Message parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[CampaignRunner] WebSocket closed');
      setStatus('disconnected');
      setIsRunning(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    ws.onerror = (event) => {
      console.error('[CampaignRunner] WebSocket error:', event);
      setError(new Error('WebSocket connection error'));
      setStatus('error');
    };

    wsRef.current = ws;
  }, [config]);

  // Handle messages from server
  const handleServerMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'registered':
        console.log('[CampaignRunner] Registered with server');
        setStatus('connected');
        break;

      case 'task':
        if (message.task && !isPaused) {
          setStallReason(null); // Clear stall if we got a task
          processTask(message.task);
        }
        break;

      case 'no_tasks':
        console.log('[CampaignRunner] No tasks available');
        // Will retry on next interval
        break;

      case 'stall_reason':
        if (message.stallReason) {
          console.log(`[CampaignRunner] Campaign stalled: ${message.stallReason}`);
          setStallReason(message.stallReason);
        } else {
          setStallReason(null);
        }
        break;

      case 'campaign_complete':
        console.log(`[CampaignRunner] Campaign ${message.campaignId} complete`);
        config.onCampaignComplete?.(message.campaignId);
        break;

      case 'error':
        console.error('[CampaignRunner] Server error:', message.error);
        setError(new Error(message.error));
        break;

      case 'heartbeat_ack':
        // Server acknowledged heartbeat
        break;
    }
  }, [isPaused, processTask, config]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    setIsRunning(false);
    webrtcActions.disconnect();
  }, [webrtcActions]);

  // Start running campaigns
  const start = useCallback(async () => {
    if (status !== 'connected') {
      console.error('[CampaignRunner] Not connected');
      return;
    }

    // Connect WebRTC first
    if (!webrtcState.isReady) {
      await webrtcActions.connect();
    }

    setIsRunning(true);
    setIsPaused(false);
    setStatus('running');

    // Signal ready and request first task
    wsRef.current?.send(JSON.stringify({ type: 'ready' }));
    requestNextTask();
  }, [status, webrtcState.isReady, webrtcActions, requestNextTask]);

  // Pause
  const pause = useCallback(() => {
    setIsPaused(true);
    setStatus('paused');
  }, []);

  // Resume
  const resume = useCallback(() => {
    setIsPaused(false);
    setStatus('running');
    if (!currentTask) {
      requestNextTask();
    }
  }, [currentTask, requestNextTask]);

  // Stop completely
  const stop = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setStatus('connected');
    
    // Hangup current call if active
    if (webrtcState.isCallActive) {
      webrtcActions.hangup();
    }
  }, [webrtcState.isCallActive, webrtcActions]);

  // Skip current call
  const skipCurrentCall = useCallback(() => {
    if (currentTask && webrtcState.isCallActive) {
      webrtcActions.hangup();
      handleTaskFailed(currentTask, 'Skipped by user');
    }
  }, [currentTask, webrtcState.isCallActive, webrtcActions, handleTaskFailed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const state: CampaignRunnerState = {
    status,
    isRunning,
    isPaused,
    currentTask,
    stats,
    error,
    stallReason,
    transcripts: webrtcState.transcripts,
    callDurationSeconds: webrtcState.callDurationSeconds,
  };

  const actions: CampaignRunnerActions = {
    connect,
    disconnect,
    start,
    pause,
    resume,
    stop,
    skipCurrentCall,
  };

  return [state, actions];
}
