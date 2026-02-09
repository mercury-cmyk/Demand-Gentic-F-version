import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  X,
  ChevronRight,
  RotateCcw,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgentPanelContext } from './AgentPanelProvider';
import { AgentChatInterface } from './AgentChatInterface';
import { OrderWizardPanel } from './OrderWizardPanel';

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
      ? 'Thinking'
      : agentStatus === 'awaiting_review'
        ? 'Awaiting review'
        : agentStatus === 'executing'
          ? 'Executing'
          : 'Ready';

  const statusDotClass =
    agentStatus === 'thinking'
      ? 'bg-sky-500'
      : agentStatus === 'awaiting_review'
        ? 'bg-amber-500'
        : agentStatus === 'executing'
          ? 'bg-violet-500'
          : 'bg-green-500';

  // Compute effective width for order mode
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

  if (!state.isOpen) {
    return (
      <div className={cn('fixed right-0 top-1/2 -translate-y-1/2 z-50', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={openPanel}
              className={cn(
                'h-24 w-8 px-0 rounded-l-2xl rounded-r-none border-r-0',
                'bg-background/80 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.1)] hover:bg-background hover:w-10 transition-all duration-300',
                'border-y border-l border-border/50'
              )}
              data-testid="button-agentx-edge-handle"
            >
              <div className="flex flex-col items-center justify-center gap-2 h-full">
                <div className="w-1 h-8 rounded-full bg-primary/20" />
                <Bot className="h-5 w-5 text-primary shrink-0" />
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="flex items-center gap-2">
            <span className="font-semibold">Open AgentX</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 opacity-70">Ctrl+/</Badge>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        ref={panelRef}
        initial={{ x: '100%', opacity: 0 }}
        animate={{
          x: 0,
          opacity: 1,
          width: state.isCollapsed ? 64 : effectiveWidth,
        }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{
          type: 'spring',
          damping: 28,
          stiffness: 280,
          width: { type: 'spring', damping: 30, stiffness: 200 },
        }}
        className={cn(
          'fixed right-0 top-0 h-screen z-50 flex',
          'bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.1)]',
          className
        )}
      >
        {/* Resize Handle */}
        {!state.isCollapsed && (
          <div
            className="absolute left-0 top-0 w-4 -translate-x-1/2 h-full z-50 cursor-col-resize group flex items-center justify-center outline-none touch-none"
            onMouseDown={handleResizeStart}
          >
            {/* Visual line */}
            <div className="w-1 h-full bg-transparent group-hover:bg-primary/10 transition-colors duration-300">
               <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1.5 h-16 rounded-full bg-border group-hover:bg-primary/60 transition-all duration-300 shadow-sm" />
            </div>
          </div>
        )}

        {/* Collapsed State */}
        {state.isCollapsed ? (
          <div className="w-full flex flex-col items-center py-4 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleCollapse}
                  className="text-primary"
                >
                  <Bot className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Expand AgentX (Ctrl+/)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Close AgentX</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex flex-col w-full h-full">
            {/* Header */}
            <div className={cn(
              'flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10',
              state.orderMode && 'border-b-primary/20'
            )}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <span
                    className={cn(
                      'absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-background',
                      statusDotClass,
                      agentStatus === 'thinking' && 'animate-pulse'
                    )}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-semibold text-sm leading-none tracking-tight">AgentX</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    <span>{statusLabel}</span>
                    <span className="opacity-30">&middot;</span>
                    <span>{prettyRole}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* New Order button - client portal only, when not in order mode */}
                {isClientPortal && !state.orderMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 rounded-lg text-xs gap-1 hover:bg-primary/10 text-primary font-medium"
                        onClick={enterOrderMode}
                      >
                        <Package className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">New Order</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Create Campaign Order</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {state.orderMode && (
                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    Order Mode
                  </Badge>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      onClick={resetSession}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>New Conversation</p>
                  </TooltipContent>
                </Tooltip>

                {!state.orderMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        onClick={toggleCollapse}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Collapse</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ml-1"
                      onClick={handleClose}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Close AgentX (Ctrl+/)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Content: Dual-zone when order mode active */}
            <div className="flex-1 overflow-hidden flex">
              {/* Order wizard zone (left side when in order mode) */}
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

              {/* Chat zone (always visible, narrower in order mode) */}
              <div className={cn(
                'flex flex-col transition-all duration-300 overflow-hidden',
                state.orderMode ? 'w-[320px] min-w-[280px]' : 'flex-1'
              )}>
                <AgentChatInterface
                  sessionId={state.sessionId}
                  conversationId={state.conversationId}
                  isClientPortal={isClientPortal}
                  userRole={userRole}
                />
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
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>AgentX (Ctrl+/)</p>
      </TooltipContent>
    </Tooltip>
  );
}
