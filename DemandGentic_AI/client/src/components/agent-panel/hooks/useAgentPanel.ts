import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'agent-panel-state';
const COLLAPSED_WIDTH_PX = 48;
const ORDER_MODE_WIDTH = 850;
const MIN_WIDTH = 350;
const MAX_WIDTH_NORMAL = 600;
const MAX_WIDTH_ORDER = 900;

export type OrderStep = 'idle' | 'goal' | 'strategy_review' | 'configure' | 'review' | 'submitted';

export interface AgentPanelState {
  isOpen: boolean;
  width: number;
  isCollapsed: boolean;
  conversationId: string | null;
  sessionId: string;
  orderMode: boolean;
  orderStep: OrderStep;
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
  enterOrderMode: () => void;
  exitOrderMode: () => void;
  setOrderStep: (step: OrderStep) => void;
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
      orderMode: false,
      orderStep: 'idle',
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
        sessionId: parsed.sessionId && (Date.now() - parseInt(parsed.sessionId.split('-')[1])) (getInitialState);
  const preOrderWidthRef = useRef(state.width);

  // Expose panel geometry via CSS vars so the app can reserve a consistent side region.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const effectiveWidth = state.orderMode ? Math.max(state.width, ORDER_MODE_WIDTH) : state.width;
    const offsetPx = state.isOpen ? (state.isCollapsed ? COLLAPSED_WIDTH_PX : effectiveWidth) : 0;

    root.style.setProperty('--agentx-panel-offset', `${offsetPx}px`);
    root.style.setProperty('--agentx-panel-width', `${effectiveWidth}px`);
    root.style.setProperty('--agentx-panel-collapsed-width', `${COLLAPSED_WIDTH_PX}px`);
    root.dataset.agentxPanelOpen = state.isOpen ? 'true' : 'false';
    root.dataset.agentxPanelCollapsed = state.isCollapsed ? 'true' : 'false';
    root.dataset.agentxOrderMode = state.orderMode ? 'true' : 'false';
  }, [state.isCollapsed, state.isOpen, state.width, state.orderMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    return () => {
      root.style.setProperty('--agentx-panel-offset', '0px');
      root.style.removeProperty('--agentx-panel-width');
      root.style.removeProperty('--agentx-panel-collapsed-width');
      root.removeAttribute('data-agentx-panel-open');
      root.removeAttribute('data-agentx-panel-collapsed');
      root.removeAttribute('data-agentx-order-mode');
    };
  }, []);

  // Persist state to localStorage (exclude orderMode — always resets)
  useEffect(() => {
    try {
      const { orderMode, orderStep, ...persistable } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
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
    setState(prev => ({
      ...prev,
      isOpen: false,
      // Reset order mode when closing
      orderMode: false,
      orderStep: 'idle',
    }));
  }, []);

  const setWidth = useCallback((width: number) => {
    setState(prev => {
      const max = prev.orderMode ? MAX_WIDTH_ORDER : MAX_WIDTH_NORMAL;
      return { ...prev, width: Math.min(Math.max(width, MIN_WIDTH), max) };
    });
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
      orderMode: false,
      orderStep: 'idle',
    }));
  }, []);

  const enterOrderMode = useCallback(() => {
    setState(prev => {
      // Store current width so we can restore it later
      preOrderWidthRef.current = prev.width;
      const expandedWidth = Math.min(
        typeof window !== 'undefined' ? window.innerWidth * 0.85 : ORDER_MODE_WIDTH,
        ORDER_MODE_WIDTH
      );
      return {
        ...prev,
        isOpen: true,
        isCollapsed: false,
        orderMode: true,
        orderStep: 'goal',
        width: expandedWidth,
      };
    });
  }, []);

  const exitOrderMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      orderMode: false,
      orderStep: 'idle',
      width: preOrderWidthRef.current,
    }));
  }, []);

  const setOrderStep = useCallback((step: OrderStep) => {
    setState(prev => ({ ...prev, orderStep: step }));
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
    enterOrderMode,
    exitOrderMode,
    setOrderStep,
  };
}