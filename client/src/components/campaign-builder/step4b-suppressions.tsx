import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";

interface Step4bSuppressionsProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function Step4bSuppressions({ data, onNext, onBack }: Step4bSuppressionsProps) {
  const handleNext = () => {
    onNext({});
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <strong>Campaign-Level Suppression:</strong> You can upload suppression lists (accounts, contacts, or domains) after creating the campaign. 
          This step is optional and can be configured later from the campaign edit page.
        </AlertDescription>
      </Alert>

      <div className="bg-muted/50 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">What can be suppressed?</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span><strong>Accounts:</strong> Suppress all contacts from specific companies</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span><strong>Contacts:</strong> Suppress individual contacts who have already been qualified or contacted</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span><strong>Domains:</strong> Suppress all contacts from specific company domains</span>
          </li>
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          <strong>Note:</strong> This is separate from the global DNC (Do Not Call) list, which applies across all campaigns.
        </p>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack}
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleNext}
          data-testid="button-next"
        >
          Continue to Summary
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
