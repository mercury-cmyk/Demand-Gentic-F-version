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
  const panelRef = useRef(null);
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
      
        
          
            
              
                
                
              
            
          
          
            Open AgentX
            Ctrl+/
          
        
      
    );
  }

  return (
    
      
        {/* Resize Handle */}
        {!state.isCollapsed && (
          
            {/* Visual line */}
            
               
            
          
        )}

        {/* Collapsed State */}
        {state.isCollapsed ? (
          
            
              
                
                  
                
              
              
                Expand AgentX (Ctrl+/)
              
            

            
              
                
                  
                
              
              
                Close AgentX
              
            
          
        ) : (
          
            {/* Header */}
            
              
                
                  
                    
                  
                  
                
                
                  AgentX
                  
                    {statusLabel}
                    &middot;
                    {prettyRole}
                  
                
              

              
                {/* New Order button - client portal only, when not in order mode */}
                {isClientPortal && !state.orderMode && (
                  
                    
                      
                        
                        New Order
                      
                    
                    
                      Create Campaign Order
                    
                  
                )}

                {state.orderMode && (
                  
                    Order Mode
                  
                )}

                
                  
                    
                      
                    
                  
                  
                    New Conversation
                  
                

                {!state.orderMode && (
                  
                    
                      
                        
                      
                    
                    
                      Collapse
                    
                  
                )}

                
                  
                    
                      
                    
                  
                  
                    Close AgentX (Ctrl+/)
                  
                
              
            

            {/* Content: Dual-zone when order mode active */}
            
              {/* Order wizard zone (left side when in order mode) */}
              
                {state.orderMode && (
                  
                    
                  
                )}
              

              {/* Chat zone (always visible, narrower in order mode) */}
              
                
              
            
          
        )}
      
    
  );
}

// Toggle button for the top bar
export function AgentPanelToggle() {
  const context = useAgentPanelContext();

  return (
    
      
        
          
          
        
      
      
        AgentX (Ctrl+/)
      
    
  );
}