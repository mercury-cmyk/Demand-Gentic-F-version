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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Test AI Voice Agent
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Phone Number (E.164)</Label>
            <Input 
              placeholder="+15550001234" 
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>AI Provider</Label>
            <RadioGroup value={provider} onValueChange={setProvider} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="openai" id="p-openai" />
                <Label htmlFor="p-openai">OpenAI</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="google" id="p-google" />
                <Label htmlFor="p-google">Live Voice</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleStartTest} disabled={loading || !phoneNumber}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Start Test Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
