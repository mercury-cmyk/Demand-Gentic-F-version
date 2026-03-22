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
    
      
        
        
          Campaign-Level Suppression: You can upload suppression lists (accounts, contacts, or domains) after creating the campaign. 
          This step is optional and can be configured later from the campaign edit page.
        
      

      
        What can be suppressed?
        
          
            •
            Accounts: Suppress all contacts from specific companies
          
          
            •
            Contacts: Suppress individual contacts who have already been qualified or contacted
          
          
            •
            Domains: Suppress all contacts from specific company domains
          
        
        
          Note: This is separate from the global DNC (Do Not Call) list, which applies across all campaigns.
        
      

      
        
          
          Back
        
        
          Continue to Summary
          
        
      
    
  );
}