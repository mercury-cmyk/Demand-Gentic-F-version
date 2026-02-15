import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pin } from "lucide-react";

const CATEGORIES = [
  { value: "objection_handling", label: "Objection Handling", description: "Agent handled objections gracefully" },
  { value: "professional_close", label: "Professional Close", description: "Ended call professionally regardless of outcome" },
  { value: "engagement_mastery", label: "Engagement Mastery", description: "Excellent engagement and rapport building" },
  { value: "difficult_situation", label: "Difficult Situation", description: "Handled difficult or hostile contact well" },
  { value: "perfect_flow", label: "Perfect Flow", description: "Flawless execution of call flow" },
  { value: "empathetic_response", label: "Empathetic Response", description: "Demonstrated strong empathy" },
] as const;

interface PinShowcaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string | null;
  suggestedCategory?: string;
  onConfirm: (category: string, notes: string) => void;
  isLoading?: boolean;
}

export function PinShowcaseDialog({
  open,
  onOpenChange,
  contactName,
  suggestedCategory,
  onConfirm,
  isLoading = false,
}: PinShowcaseDialogProps) {
  const [category, setCategory] = useState(suggestedCategory || "");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    onConfirm(category, notes);
    setCategory("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-5 w-5" />
            Pin as Showcase Call
          </DialogTitle>
          <DialogDescription>
            {contactName
              ? `Showcase the call with ${contactName} as an example of excellent agent performance.`
              : "Pin this call as an example of excellent agent performance for client demos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select what makes this call great..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <div>
                      <div className="font-medium">{cat.label}</div>
                      <div className="text-xs text-muted-foreground">{cat.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Why is this call a great example? Any specific moments to highlight..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!category || isLoading}>
            {isLoading ? "Pinning..." : "Pin as Showcase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PinShowcaseDialog;
