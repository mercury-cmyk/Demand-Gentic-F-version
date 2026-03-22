import { useState, type MouseEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pin, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PinShowcaseDialog } from "./pin-showcase-dialog";

interface PushToShowcaseButtonProps {
  callSessionId?: string | null;
  contactName?: string | null;
  sourceLabel?: string;
  suggestedCategory?: string;
  label?: string;
  stopPropagation?: boolean;
  buttonProps?: Omit;
}

export function PushToShowcaseButton({
  callSessionId,
  contactName,
  sourceLabel,
  suggestedCategory,
  label = "Push to Showcase",
  stopPropagation = false,
  buttonProps,
}: PushToShowcaseButtonProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const pinMutation = useMutation({
    mutationFn: async ({ category, notes }: { category: string; notes: string }) => {
      if (!callSessionId) {
        throw new Error("Missing call session id");
      }
      const res = await apiRequest("POST", `/api/showcase-calls/${callSessionId}/pin`, {
        category,
        notes,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Call added to showcase",
        description: sourceLabel ? `Source: ${sourceLabel}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/auto-detect"] });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add call to showcase",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClick = (event: MouseEvent) => {
    if (stopPropagation) {
      event.preventDefault();
      event.stopPropagation();
    }
    setOpen(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const handleConfirm = (category: string, notes: string) => {
    pinMutation.mutate({ category, notes });
  };

  return (
    <>
      
        {pinMutation.isPending ?  : }
        {label}
      

      
    
  );
}

export default PushToShowcaseButton;