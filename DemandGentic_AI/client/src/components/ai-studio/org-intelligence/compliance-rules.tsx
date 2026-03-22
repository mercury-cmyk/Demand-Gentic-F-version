import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ComplianceRules() {
  const [dos, setDos] = useState([
    "Always disclose you are an AI agent",
    "Verify decision maker status early",
    "Record all calls for quality assurance"
  ]);
  
  const [donts, setDonts] = useState([
    "Never promise specific ROI numbers without data",
    "Do not discuss competitor pricing",
    "Never ask for credit card info over chat"
  ]);

  const [newDo, setNewDo] = useState("");
  const [newDont, setNewDont] = useState("");

  const addDo = () => {
    if (newDo.trim()) {
      setDos([...dos, newDo.trim()]);
      setNewDo("");
    }
  };

  const addDont = () => {
    if (newDont.trim()) {
      setDonts([...donts, newDont.trim()]);
      setNewDont("");
    }
  };

  const removeDo = (index: number) => {
    setDos(dos.filter((_, i) => i !== index));
  };

  const removeDont = (index: number) => {
    setDonts(donts.filter((_, i) => i !== index));
  };

  return (
    
      
        
          
            
            Do's (Encouraged)
          
          
            Behaviors and actions the AI should prioritize.
          
        
        
          
             setNewDo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDo()}
            />
            
              
            
          
          
            {dos.map((rule, i) => (
              
                {rule}
                 removeDo(i)}>
                  
                
              
            ))}
          
        
      

      
        
          
            
            Don'ts (Restricted)
          
          
            Strict prohibitions and negative constraints.
          
        
        
          
             setNewDont(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDont()}
            />
            
              
            
          
          
            {donts.map((rule, i) => (
              
                {rule}
                 removeDont(i)}>
                  
                
              
            ))}
          
        
      
    
  );
}