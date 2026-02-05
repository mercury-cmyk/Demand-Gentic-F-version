import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'agent-panel-state';
const COLLAPSED_WIDTH_PX = 48;

export interface AgentPanelState {
  isOpen: boolean;
  width: number;
  isCollapsed: boolean;
  conversationId: string | null;
  sessionId: string;
}

interface UseAgentPanelReturn {
  state: AgentPanelState;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setWidth: (width: number) => void;
  toggleCollapse: () => void;
  setConversationId: (id: string | null) => void;
  resetSession: () => void;
}

const generateSessionId = () => {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const getInitialState = (): AgentPanelState => {
  if (typeof window === 'undefined') {
    return {
      isOpen: false,
      width: 400,
      isCollapsed: false,
      conversationId: null,
      sessionId: generateSessionId(),
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        // Always start with panel closed on page load
        isOpen: false,
        // Generate new session ID if expired (1 hour)
        sessionId: parsed.sessionId && (Date.now() - parseInt(parsed.sessionId.split('-')[1])) < 3600000
          ? parsed.sessionId
          : generateSessionId(),
      };
    }
  } catch {
    // Ignore storage errors
  }

  return {
    isOpen: false,
    width: 400,
    isCollapsed: false,
    conversationId: null,
    sessionId: generateSessionId(),
  };
};

export function useAgentPanel(): UseAgentPanelReturn {
  const [state, setState] = useState<AgentPanelState>(getInitialState);

  // Expose panel geometry via CSS vars so the app can reserve a consistent side region.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const offsetPx = state.isOpen ? (state.isCollapsed ? COLLAPSED_WIDTH_PX : state.width) : 0;

    root.style.setProperty('--agentx-panel-offset', `${offsetPx}px`);
    root.style.setProperty('--agentx-panel-width', `${state.width}px`);
    root.style.setProperty('--agentx-panel-collapsed-width', `${COLLAPSED_WIDTH_PX}px`);
    root.dataset.agentxPanelOpen = state.isOpen ? 'true' : 'false';
    root.dataset.agentxPanelCollapsed = state.isCollapsed ? 'true' : 'false';
  }, [state.isCollapsed, state.isOpen, state.width]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    return () => {
      root.style.setProperty('--agentx-panel-offset', '0px');
      root.style.removeProperty('--agentx-panel-width');
      root.style.removeProperty('--agentx-panel-collapsed-width');
      root.removeAttribute('data-agentx-panel-open');
      root.removeAttribute('data-agentx-panel-collapsed');
    };
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }, [state]);

  // Keyboard shortcut: Ctrl+/ or Cmd+/ to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setState(prev => ({ ...prev, isOpen: !prev.isOpen }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const togglePanel = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  const openPanel = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: true }));
  }, []);

  const closePanel = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const setWidth = useCallback((width: number) => {
    setState(prev => ({ ...prev, width: Math.min(Math.max(width, 350), 600) }));
  }, []);

  const toggleCollapse = useCallback(() => {
    setState(prev => ({ ...prev, isCollapsed: !prev.isCollapsed }));
  }, []);

  const setConversationId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, conversationId: id }));
  }, []);

  const resetSession = useCallback(() => {
    setState(prev => ({
      ...prev,
      sessionId: generateSessionId(),
      conversationId: null,
    }));
  }, []);

  return {
    state,
    togglePanel,
    openPanel,
    closePanel,
    setWidth,
    toggleCollapse,
    setConversationId,
    resetSession,
  };
}
