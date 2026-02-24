/**
 * Create Pipeline Dialog — Dialog for creating a new journey pipeline.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, X, GripVertical } from "lucide-react";

interface CreatePipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authHeaders: { headers: { Authorization: string } };
  onCreated: () => void;
}

const DEFAULT_STAGES = [
  { id: "new_lead", name: "New Lead", order: 0, color: "#3b82f6" },
  { id: "callback_scheduled", name: "Callback Scheduled", order: 1, color: "#06b6d4" },
  { id: "contacted", name: "Contacted", order: 2, color: "#f59e0b" },
  { id: "engaged", name: "Engaged", order: 3, color: "#8b5cf6" },
  { id: "appointment_set", name: "Appointment Set", order: 4, color: "#10b981" },
  { id: "closed", name: "Closed", order: 5, color: "#6b7280" },
];

const DISPOSITION_OPTIONS = [
  { value: "voicemail", label: "Voicemail" },
  { value: "callback_requested", label: "Callback Requested" },
  { value: "needs_review", label: "Needs Review" },
  { value: "no_answer", label: "No Answer" },
  { value: "not_interested", label: "Not Interested" },
];

export function CreatePipelineDialog({
  open,
  onOpenChange,
  authHeaders,
  onCreated,
}: CreatePipelineDialogProps) {
  const [name, setName] = useState("Follow-Up Pipeline");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [autoEnrollDispositions, setAutoEnrollDispositions] = useState<string[]>([
    "voicemail",
    "callback_requested",
    "needs_review",
    "no_answer",
  ]);
  const [newStageName, setNewStageName] = useState("");

  const createPipeline = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/client-portal/journey-pipeline/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders.headers },
        body: JSON.stringify({
          name,
          description: description || undefined,
          stages: stages.map((s, i) => ({ ...s, order: i })),
          autoEnrollDispositions,
        }),
      });
      if (!res.ok) throw new Error("Failed to create pipeline");
      return res.json();
    },
    onSuccess: onCreated,
  });

  const addStage = () => {
    if (!newStageName.trim()) return;
    const id = newStageName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const colors = ["#3b82f6", "#06b6d4", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#ec4899"];
    setStages([
      ...stages,
      {
        id,
        name: newStageName.trim(),
        order: stages.length,
        color: colors[stages.length % colors.length],
      },
    ]);
    setNewStageName("");
  };

  const removeStage = (id: string) => {
    setStages(stages.filter((s) => s.id !== id));
  };

  const toggleDisposition = (value: string) => {
    setAutoEnrollDispositions((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Journey Pipeline</DialogTitle>
          <DialogDescription>
            Set up a pipeline to manage leads that need follow-up from your campaigns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label>Pipeline Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Appointment Setting Follow-Up"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this pipeline for?"
              className="min-h-[60px]"
            />
          </div>

          {/* Stages */}
          <div className="space-y-2">
            <Label>Pipeline Stages</Label>
            <div className="space-y-1.5">
              {stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-2 p-2 border rounded-md bg-background"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="flex-1 text-sm">{stage.name}</span>
                  <Badge variant="outline" className="text-xs">
                    #{index + 1}
                  </Badge>
                  {stages.length > 2 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => removeStage(stage.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Add new stage..."
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && addStage()}
              />
              <Button size="sm" variant="outline" className="h-8" onClick={addStage}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Auto-Enroll Dispositions */}
          <div className="space-y-2">
            <Label>Auto-Enroll Dispositions</Label>
            <p className="text-xs text-muted-foreground">
              Leads with these call outcomes will be automatically enrolled in this pipeline.
            </p>
            <div className="space-y-2">
              {DISPOSITION_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`disp-${opt.value}`}
                    checked={autoEnrollDispositions.includes(opt.value)}
                    onCheckedChange={() => toggleDisposition(opt.value)}
                  />
                  <label htmlFor={`disp-${opt.value}`} className="text-sm cursor-pointer">
                    {opt.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createPipeline.mutate()}
            disabled={!name.trim() || stages.length < 2 || createPipeline.isPending}
          >
            {createPipeline.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
