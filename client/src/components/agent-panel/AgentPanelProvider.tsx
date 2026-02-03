import React, { createContext, useContext, ReactNode } from 'react';
import { useAgentPanel, type AgentPanelState } from './hooks/useAgentPanel';

interface AgentPanelContextValue {
  state: AgentPanelState;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setWidth: (width: number) => void;
  toggleCollapse: () => void;
  setConversationId: (id: string | null) => void;
  resetSession: () => void;
  // User role context
  userRole: string;
  isClientPortal: boolean;
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

  const value: AgentPanelContextValue = {
    ...panelState,
    userRole,
    isClientPortal,
  };

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
