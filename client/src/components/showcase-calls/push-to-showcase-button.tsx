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
  buttonProps?: Omit<ButtonProps, "onClick">;
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

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
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
      <Button
        variant="outline"
        size="sm"
        {...buttonProps}
        className={cn("gap-1.5", buttonProps?.className)}
        disabled={buttonProps?.disabled || !callSessionId || pinMutation.isPending}
        onClick={handleClick}
        title={callSessionId ? "Add this call to showcase calls" : "Call session not available"}
      >
        {pinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className="h-4 w-4" />}
        {label}
      </Button>

      <PinShowcaseDialog
        open={open}
        onOpenChange={handleOpenChange}
        contactName={contactName}
        suggestedCategory={suggestedCategory}
        onConfirm={handleConfirm}
        isLoading={pinMutation.isPending}
      />
    </>
  );
}

export default PushToShowcaseButton;
