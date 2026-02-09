import React, { createContext, useContext, ReactNode, useCallback, useMemo, useState } from 'react';
import { useAgentPanel, type AgentPanelState, type OrderStep } from './hooks/useAgentPanel';

export type AgentXStatus = 'idle' | 'thinking' | 'awaiting_review' | 'executing';

interface AgentPanelContextValue {
  state: AgentPanelState;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setWidth: (width: number) => void;
  toggleCollapse: () => void;
  setConversationId: (id: string | null) => void;
  resetSession: () => void;
  agentStatus: AgentXStatus;
  setAgentStatus: (status: AgentXStatus) => void;
  // User role context
  userRole: string;
  isClientPortal: boolean;
  // Order mode
  enterOrderMode: () => void;
  exitOrderMode: () => void;
  setOrderStep: (step: OrderStep) => void;
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null);

interface AgentPanelProviderProps {
  children: ReactNode;
  userRole?: string;
  isClientPortal?: boolean;
}

export function AgentPanelProvider({
  children,
  userRole = 'agent',
  isClientPortal = false,
}: AgentPanelProviderProps) {
  const panelState = useAgentPanel();
  const [agentStatus, setAgentStatus] = useState<AgentXStatus>('idle');

  const resetSession = useCallback(() => {
    panelState.resetSession();
    setAgentStatus('idle');
  }, [panelState]);

  const value: AgentPanelContextValue = useMemo(
    () => ({
      ...panelState,
      resetSession,
      agentStatus,
      setAgentStatus,
      userRole,
      isClientPortal,
    }),
    [agentStatus, isClientPortal, panelState, resetSession, userRole]
  );

  return (
    <AgentPanelContext.Provider value={value}>
      {children}
    </AgentPanelContext.Provider>
  );
}

export function useAgentPanelContext() {
  const context = useContext(AgentPanelContext);
  if (!context) {
    throw new Error('useAgentPanelContext must be used within an AgentPanelProvider');
  }
  return context;
}

// Optional hook that doesn't throw - returns null if not in provider
export function useAgentPanelContextOptional() {
  return useContext(AgentPanelContext);
}
