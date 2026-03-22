/**
 * useDirectAgenticOrderModal — Order Form Launcher Hook
 *
 * Provides a single abstraction for opening the canonical "Submit New Direct Agentic Order"
 * modal from any context (Work Orders tab, Upcoming Events tab, etc.).
 *
 * Features:
 * - Opens the shared WorkOrderForm modal
 * - Supports pre-filling from event context or arbitrary initial values
 * - Handles idempotency check for event-based orders
 * - Returns modal state for rendering
 *
 * Usage:
 *   const { openModal, modalProps } = useDirectAgenticOrderModal();
 *
 *   // Open plain (Work Orders tab):
 *   openModal();
 *
 *   // Open with event context (Upcoming Events tab):
 *   openModal({
 *     mode: 'event',
 *     eventContext: { externalEventId, eventTitle, eventDate, ... },
 *   });
 *
 *   // Render:
 *   
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { WorkOrderFormData } from '@/components/client-portal/work-orders/work-order-form';

export interface EventContext {
  externalEventId: string;
  eventTitle: string;
  eventDate?: string;
  eventType?: string;
  eventLocation?: string;
  eventCommunity?: string;
  eventSourceUrl: string;
  leadCount?: number;
}

export interface OpenModalOptions {
  mode?: 'direct' | 'event';
  initialValues?: Partial;
  eventContext?: EventContext;
}

export function useDirectAgenticOrderModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentEventContext, setCurrentEventContext] = useState(null);
  const [currentInitialValues, setCurrentInitialValues] = useState | undefined>(undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getToken = () => localStorage.getItem('clientPortalToken');

  /**
   * Open the canonical order modal.
   * If event context is provided, performs an idempotency check first.
   */
  const openModal = useCallback(async (options?: OpenModalOptions) => {
    const { mode = 'direct', initialValues, eventContext } = options || {};

    if (mode === 'event' && eventContext) {
      // Idempotency check: see if an order already exists for this event
      try {
        const res = await fetch(
          `/api/client-portal/work-orders/client/by-event/${eventContext.externalEventId}`,
          {
            headers: { Authorization: `Bearer ${getToken()}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.exists && data.draftStatus === 'submitted' && data.workOrder) {
            toast({
              title: 'Order Already Exists',
              description: `Order ${data.workOrder.orderNumber || data.workOrder.order_number} was already submitted for this event. Check your Work Orders tab.`,
              variant: 'default',
            });
            return; // Don't open — order already exists
          }
        }
      } catch {
        // Non-blocking — proceed to open modal even if check fails
        console.warn('[useDirectAgenticOrderModal] Idempotency check failed, proceeding');
      }

      setCurrentEventContext(eventContext);
      setCurrentInitialValues(initialValues);
    } else {
      setCurrentEventContext(null);
      setCurrentInitialValues(initialValues);
    }

    setIsOpen(true);
  }, [toast]);

  /**
   * Close the modal and reset context
   */
  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Delay clearing context to allow close animation
    setTimeout(() => {
      setCurrentEventContext(null);
      setCurrentInitialValues(undefined);
    }, 300);
  }, []);

  /**
   * Handle successful order creation
   */
  const handleSuccess = useCallback((order: any) => {
    // Invalidate relevant queries
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    if (currentEventContext) {
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
    }
  }, [queryClient, currentEventContext]);

  /**
   * Props to spread onto 
   */
  const modalProps = {
    open: isOpen,
    onOpenChange: (open: boolean) => {
      if (!open) closeModal();
      else setIsOpen(true);
    },
    onSuccess: handleSuccess,
    initialValues: currentInitialValues,
    eventContext: currentEventContext,
  };

  return {
    /** Opens the modal with optional config */
    openModal,
    /** Closes the modal */
    closeModal,
    /** Whether the modal is currently open */
    isOpen,
    /** Props to spread onto  */
    modalProps,
    /** Current event context (if any) */
    eventContext: currentEventContext,
  };
}

export default useDirectAgenticOrderModal;