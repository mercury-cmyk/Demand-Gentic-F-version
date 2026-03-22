import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  X,
  ChevronRight,
  RotateCcw,
  Package,
  Sparkles,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgentPanelContext } from './AgentPanelProvider';
import { AgentChatInterface } from './AgentChatInterface';
import { OrderWizardPanel } from './OrderWizardPanel';
import { AgentRealtimeVoice } from './AgentRealtimeVoice';

interface AgentSidePanelProps {
  className?: string;
}

export function AgentSidePanel({ className }: AgentSidePanelProps) {
  const {
    state,
    openPanel,
    closePanel,
    setWidth,
    toggleCollapse,
    resetSession,
    agentStatus,
    userRole,
    isClientPortal,
    enterOrderMode,
    exitOrderMode,
    setOrderStep,
  } = useAgentPanelContext();

  const [isResizing, setIsResizing] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startWidthRef = useRef(state.width);
  const startXRef = useRef(0);

  const prettyRole = isClientPortal
    ? 'Client'
    : userRole
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

  const statusLabel =
    agentStatus === 'thinking'
      ? 'Thinking...'
      : agentStatus === 'awaiting_review'
        ? 'Awaiting Review'
        : agentStatus === 'executing'
          ? 'Executing...'
          : 'Ready';

  const statusDotClass =
    agentStatus === 'thinking'
      ? 'bg-sky-400 shadow-sky-400/50'
      : agentStatus === 'awaiting_review'
        ? 'bg-amber-400 shadow-amber-400/50'
        : agentStatus === 'executing'
          ? 'bg-violet-400 shadow-violet-400/50'
          : 'bg-emerald-400 shadow-emerald-400/50';

  const effectiveWidth = state.orderMode
    ? Math.max(state.width, 850)
    : state.width;

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = startXRef.current - e.clientX;
      const newWidth = startWidthRef.current + deltaX;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setWidth]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = effectiveWidth;
  };

  const handleClose = () => {
    if (state.orderMode) {
      exitOrderMode();
    }
    closePanel();
  };

  // ── Closed state: edge handle ──
  if (!state.isOpen) {
    return (
      <div className={cn('fixed right-0 top-1/2 -translate-y-1/2 z-50', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={openPanel}
              className={cn(
                'h-20 w-9 px-0 rounded-l-2xl rounded-r-none border-r-0',
                'bg-background/90 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:bg-background hover:w-11 transition-all duration-300',
                'border-y border-l border-border/40'
              )}
              data-testid="button-agentc-edge-handle"
            >
              <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                <div className="relative">
                  <Bot className="h-5 w-5 text-primary shrink-0" />
                  <span className={cn('absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full shadow-[0_0_6px]', statusDotClass)} />
                </div>
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="flex items-center gap-2">
            <span className="font-semibold">AgentC</span>
            <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">Ctrl+/</kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // ── Open state ──
  return (
    <AnimatePresence mode="wait">
      <motion.div
        ref={panelRef}
        initial={{ x: '100%', opacity: 0, filter: 'blur(8px)' }}
        animate={{
          x: 0,
          opacity: 1,
          filter: 'blur(0px)',
          width: state.isCollapsed ? 64 : effectiveWidth,
        }}
        exit={{ x: '100%', opacity: 0, filter: 'blur(8px)' }}
        transition={{
          type: 'spring',
          damping: 25,
          stiffness: 250,
          opacity: { duration: 0.2 },
          filter: { duration: 0.2 },
          width: { type: 'spring', damping: 30, stiffness: 220 },
        }}
        className={cn(
          'fixed right-0 top-0 h-screen z-50 flex',
          'bg-white/85 dark:bg-slate-950/85 backdrop-blur-3xl border-l border-slate-200/50 dark:border-slate-800/50',
          'shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.1)]',
          className
        )}
      >
        {/* Resize Handle */}
        {!state.isCollapsed && (
          <div
            className={cn(
              "absolute left-0 top-0 w-4 -translate-x-1/2 h-full z-50 cursor-col-resize group flex items-center justify-center outline-none touch-none",
              isResizing ? "bg-primary/5" : ""
            )}
            onMouseDown={handleResizeStart}
          >
            <div className={cn(
              "w-px h-full transition-colors duration-300",
              isResizing ? "bg-primary/30" : "bg-transparent group-hover:bg-primary/15"
            )}>
              <div className={cn(
                "absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 rounded-full transition-all duration-300",
                isResizing ? "w-1.5 h-32 bg-primary/70 shadow-[0_0_12px_rgba(var(--primary),0.5)]" : "w-1 h-12 bg-border/60 group-hover:bg-primary/50 group-hover:h-20"
              )} />
            </div>
          </div>
        )}

        {/* Collapsed State */}
        {state.isCollapsed ? (
          <div className="w-full flex flex-col items-center py-4 gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleCollapse}
                  className="relative text-primary hover:bg-primary/10"
                >
                  <Bot className="h-5 w-5" />
                  <span className={cn('absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full shadow-[0_0_6px]', statusDotClass)} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Expand AgentC</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Close AgentC</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex flex-col w-full h-full">
            {/* ── Header ── */}
            <div className={cn(
              'flex items-center justify-between px-4 h-14 border-b shrink-0',
              state.orderMode
                ? 'border-b-primary/20 bg-primary/[0.02]'
                : 'border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'
            )}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <span className={cn(
                    'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-background shadow-[0_0_6px]',
                    statusDotClass,
                    (agentStatus === 'thinking' || agentStatus === 'executing') && 'animate-pulse'
                  )} />
                </div>
                <div className="flex flex-col">
                  <h3 className="font-semibold text-[13px] leading-none tracking-tight text-foreground">AgentC</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-medium text-muted-foreground/80">{statusLabel}</span>
                    <span className="text-[10px] text-muted-foreground/30">&middot;</span>
                    <span className="text-[10px] font-medium text-muted-foreground/80">{prettyRole}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                {/* New Order button - client portal only */}
                {isClientPortal && !state.orderMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 rounded-lg text-xs gap-1.5 hover:bg-primary/10 text-primary font-medium"
                        onClick={enterOrderMode}
                      >
                        <Package className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Order</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create Campaign Order</TooltipContent>
                  </Tooltip>
                )}

                {state.orderMode && (
                  <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20 gap-1">
                    <Sparkles className="h-3 w-3" />
                    Order Mode
                  </Badge>
                )}

                {/* Realtime Voice Toggle */}
                {!state.orderMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-7 px-2 rounded-lg text-xs gap-1.5 font-medium',
                          voiceMode
                            ? 'bg-violet-500/10 text-violet-500 hover:bg-violet-500/20'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        )}
                        onClick={() => setVoiceMode(!voiceMode)}
                      >
                        <Radio className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Voice</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{voiceMode ? 'Switch to Chat' : 'Realtime Voice'}</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                      onClick={resetSession}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Conversation</TooltipContent>
                </Tooltip>

                {!state.orderMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={toggleCollapse}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Collapse</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive ml-0.5"
                      onClick={handleClose}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Close</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* ── Content: Dual-zone when order mode active ── */}
            <div className="flex-1 overflow-hidden flex">
              <AnimatePresence>
                {state.orderMode && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="flex-1 overflow-hidden border-r border-border/40"
                  >
                    <OrderWizardPanel
                      orderStep={state.orderStep}
                      onStepChange={setOrderStep}
                      onClose={exitOrderMode}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Chat / Voice zone */}
              <div className={cn(
                'flex flex-col transition-all duration-300 overflow-hidden',
                state.orderMode ? 'w-[320px] min-w-[280px]' : 'flex-1'
              )}>
                {voiceMode && !state.orderMode ? (
                  <AgentRealtimeVoice
                    isClientPortal={isClientPortal}
                    onClose={() => setVoiceMode(false)}
                  />
                ) : (
                  <AgentChatInterface
                    sessionId={state.sessionId}
                    conversationId={state.conversationId}
                    isClientPortal={isClientPortal}
                    userRole={userRole}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Toggle button for the top bar
export function AgentPanelToggle() {
  const context = useAgentPanelContext();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={context.togglePanel}
          className={cn(
            'relative',
            context.state.isOpen && 'bg-primary/10 text-primary'
          )}
        >
          <Bot className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-emerald-400 rounded-full shadow-[0_0_6px] shadow-emerald-400/50" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>AgentC (Ctrl+/)</p>
      </TooltipContent>
    </Tooltip>
  );
}
