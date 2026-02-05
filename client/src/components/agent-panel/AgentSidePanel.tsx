import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  X,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAgentPanelContext } from './AgentPanelProvider';
import { AgentChatInterface } from './AgentChatInterface';
import { AgentQuickActions } from './AgentQuickActions';

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
    startWidthRef.current = state.width;
  };

  // Panel animation variants
  const panelVariants = {
    hidden: {
      x: '100%',
      opacity: 0,
    },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 300,
      },
    },
    collapsed: {
      x: 0,
      opacity: 1,
      width: 48,
    },
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
                'h-14 w-12 px-0 rounded-l-xl rounded-r-none border-r-0',
                'bg-card/95 backdrop-blur shadow-lg hover:bg-card'
              )}
              data-testid="button-agentx-edge-handle"
            >
              <div className="flex flex-col items-center justify-center gap-1">
                <Bot className="h-5 w-5 text-primary" />
                <span className="text-[10px] font-semibold leading-none text-muted-foreground">
                  AgentX
                </span>
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Open AgentX (Ctrl+/) • {statusLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        ref={panelRef}
        initial="hidden"
        animate={state.isCollapsed ? 'collapsed' : 'visible'}
        exit="hidden"
        variants={panelVariants}
        className={cn(
          'fixed right-0 top-0 h-screen z-50 flex',
          'bg-card border-l border-border shadow-xl',
          className
        )}
        style={{
          width: state.isCollapsed ? 48 : state.width,
        }}
      >
        {/* Resize Handle */}
        {!state.isCollapsed && (
          <div
            className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors group"
            onMouseDown={handleResizeStart}
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-border group-hover:bg-primary/40 rounded-full transition-colors" />
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
                  onClick={closePanel}
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
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Bot className="h-5 w-5 text-primary" />
                  <span
                    className={cn(
                      'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full',
                      statusDotClass,
                      agentStatus === 'thinking' && 'animate-pulse'
                    )}
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">AgentX</h3>
                  <p className="text-xs text-muted-foreground">
                    {statusLabel} <span className="text-muted-foreground/40">•</span> {prettyRole}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={resetSession}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>New Conversation</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={toggleCollapse}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Collapse</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={closePanel}
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

            {/* Quick Actions */}
            <AgentQuickActions isClientPortal={isClientPortal} userRole={userRole} />

            {/* Chat Interface */}
            <div className="flex-1 overflow-hidden">
              <AgentChatInterface
                sessionId={state.sessionId}
                conversationId={state.conversationId}
                isClientPortal={isClientPortal}
                userRole={userRole}
              />
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
