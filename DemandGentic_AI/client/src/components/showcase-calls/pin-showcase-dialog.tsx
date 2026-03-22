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
    
      
        
          
            
            Pin as Showcase Call
          
          
            {contactName
              ? `Showcase the call with ${contactName} as an example of excellent agent performance.`
              : "Pin this call as an example of excellent agent performance for client demos."}
          
        

        
          
            Category
            
              
                
              
              
                {CATEGORIES.map((cat) => (
                  
                    
                      {cat.label}
                      {cat.description}
                    
                  
                ))}
              
            
          

          
            Notes (optional)
             setNotes(e.target.value)}
              rows={3}
            />
          
        

        
           onOpenChange(false)} disabled={isLoading}>
            Cancel
          
          
            {isLoading ? "Pinning..." : "Pin as Showcase"}
          
        
      
    
  );
}

export default PinShowcaseDialog;