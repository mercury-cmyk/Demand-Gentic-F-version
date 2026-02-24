/**
 * Schedule Action Dialog — Schedule callbacks, emails, or add notes for a journey lead.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Phone, Mail, StickyNote } from "lucide-react";

interface ScheduleActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  actionType: "callback" | "email" | "note";
  authHeaders: { headers: { Authorization: string } };
  onCreated: () => void;
}

export function ScheduleActionDialog({
  open,
  onOpenChange,
  leadId,
  actionType,
  authHeaders,
  onCreated,
}: ScheduleActionDialogProps) {
  const [type, setType] = useState(actionType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("10:00");

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setType(actionType);
      setTitle("");
      setDescription("");
      setScheduledDate("");
      setScheduledTime("10:00");
    }
    onOpenChange(v);
  };

  // ─── Generate AI content ───
  const generateAI = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}/generate-followup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders.headers },
          body: JSON.stringify({
            type: type === "email" ? "email" : "callback",
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to generate");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.type === "callback" && data.context) {
        setTitle("Follow-up callback");
        const points = data.context.talkingPoints?.join("\n- ") || "";
        setDescription(
          `Opening: ${data.context.openingLine || ""}\n\nTalking Points:\n- ${points}\n\nApproach: ${data.context.recommendedApproach || ""}`
        );
      } else if (data.type === "email" && data.email) {
        setTitle(data.email.subject || "Follow-up email");
        setDescription(data.email.bodyHtml?.replace(/<[^>]*>/g, " ").trim() || "");
      }
    },
  });

  // ─── Create action ───
  const createAction = useMutation({
    mutationFn: async () => {
      let scheduledAt: string | undefined;
      if (type !== "note" && scheduledDate) {
        scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      }

      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders.headers },
          body: JSON.stringify({
            actionType: type,
            scheduledAt,
            title: title || `${type} action`,
            description: description || undefined,
            aiGeneratedContext: generateAI.data?.context || generateAI.data?.email || undefined,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create action");
      return res.json();
    },
    onSuccess: () => {
      onCreated();
    },
  });

  const icons: Record<string, any> = {
    callback: Phone,
    email: Mail,
    note: StickyNote,
  };
  const Icon = icons[type] || Phone;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {type === "note" ? "Add Note" : `Schedule ${type === "callback" ? "Callback" : "Email"}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Action type */}
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="callback">Callback</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Schedule date/time (not for notes) */}
          {type !== "note" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === "callback"
                  ? "e.g. Follow-up callback re: pricing discussion"
                  : type === "email"
                    ? "e.g. Value-add email with case study"
                    : "e.g. Spoke with assistant, decision maker OOO until March"
              }
            />
          </div>

          {/* Description / Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {type === "callback" ? "Talking Points / Notes" : type === "email" ? "Email Content" : "Note"}
              </Label>
              {type !== "note" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1"
                  onClick={() => generateAI.mutate()}
                  disabled={generateAI.isPending}
                >
                  {generateAI.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI Generate
                </Button>
              )}
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "callback"
                  ? "Key points to cover, context from previous calls..."
                  : type === "email"
                    ? "Email body content..."
                    : "Your notes..."
              }
              className="min-h-[120px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createAction.mutate()}
            disabled={createAction.isPending}
          >
            {createAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {type === "note" ? "Add Note" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
