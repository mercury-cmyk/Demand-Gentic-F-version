import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Phone, Play, Loader2 } from "lucide-react";

export function TestCallModal({ isOpen, onClose, agent }: any) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState(agent?.provider || 'openai');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleStartTest = async () => {
    if (!phoneNumber) return;
    
    setLoading(true);
    const endpoint = provider === 'google' 
      ? '/api/ai-calls/test-gemini-live' 
      : '/api/ai-calls/test-openai-realtime';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          virtualAgentId: agent?.id,
          voice: agent?.voice,
          systemPrompt: agent?.systemPrompt
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Call Initiated",
          description: `Test call started via ${provider === 'google' ? 'Gemini' : 'OpenAI'}. Your phone should ring shortly.`,
        });
        onClose();
      } else {
        throw new Error(data.message || "Failed to start call");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Call Failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    
      
        
          
            
            Test AI Voice Agent
          
        
        
        
          
            Phone Number (E.164)
             setPhoneNumber(e.target.value)}
            />
          

          
            AI Provider
            
              
                
                OpenAI
              
              
                
                Live Voice
              
            
          
        

        
          Cancel
          
            {loading ?  : }
            Start Test Call
          
        
      
    
  );
}